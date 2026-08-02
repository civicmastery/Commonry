/**
 * Card Analysis Service
 *
 * Provides content analysis for flashcards including:
 * - Domain detection (12 content domains)
 * - Complexity analysis
 * - Card type detection
 * - Language detection
 * - Concept extraction
 *
 * Uses a cost-efficient hybrid approach: rule-based extraction where possible,
 * with LLM fallback for ambiguous cases (stub for future implementation).
 */

import { ulid } from "ulid";
import { domainKeywords, stopWords } from "./keyword-dictionaries.js";

/**
 * Generate ULID with prefix
 */
function generateULID(prefix) {
  return `${prefix}_${ulid()}`;
}

/**
 * Service for analyzing flashcard content.
 *
 * Provides rule-based analysis including domain detection, complexity scoring,
 * card type detection, language detection, and concept extraction.
 *
 * @example
 * const service = new CardAnalysisService(pool);
 * const analysis = await service.analyzeCard(cardId);
 */
export class CardAnalysisService {
  constructor(pool, options = {}) {
    this.pool = pool;
    this.options = {
      // Minimum confidence to accept rule-based domain detection
      minDomainConfidence: 0.3,
      // Threshold for secondary domains (percentage of top score)
      secondaryDomainThreshold: 0.3,
      // Maximum concepts to extract
      maxConcepts: 10,
      ...options,
    };
  }

  // ============================================================
  // MAIN ANALYSIS METHODS
  // ============================================================

  /**
   * Analyze a single card and store the results
   * @param {string} cardId - The card ID to analyze
   * @param {object} options - Analysis options
   * @returns {object} Analysis result
   */
  async analyzeCard(cardId, options = {}) {
    const { immediate: _immediate = false, userId: _userId } = options;

    // Fetch card content
    const cardResult = await this.pool.query(
      "SELECT card_id, front_content, back_content FROM cards WHERE card_id = $1",
      [cardId],
    );

    if (cardResult.rows.length === 0) {
      throw new Error(`Card not found: ${cardId}`);
    }

    const card = cardResult.rows[0];
    const frontText = this.extractTextFromContent(card.front_content);
    const backText = this.extractTextFromContent(card.back_content);
    const combinedText = `${frontText} ${backText}`;

    // Run rule-based analysis
    const analysis = this.runRuleBasedAnalysis(
      frontText,
      backText,
      combinedText,
    );

    // Determine if LLM is needed
    const needsLLM =
      analysis.domainConfidence < this.options.minDomainConfidence;
    const status = needsLLM ? "needs_llm" : "completed";
    const method = needsLLM ? "hybrid" : "rule_based";

    // Get current analysis version
    const versionResult = await this.pool.query(
      "SELECT MAX(analysis_version) as max_version FROM card_analysis WHERE card_id = $1",
      [cardId],
    );
    const newVersion = (versionResult.rows[0]?.max_version || 0) + 1;

    // Store analysis
    const analysisId = generateULID("ana");
    await this.pool.query(
      `INSERT INTO card_analysis (
        analysis_id, card_id, analysis_version,
        detected_domain, domain_confidence, secondary_domains,
        extracted_concepts, complexity_level, complexity_score,
        front_word_count, back_word_count, detected_card_type,
        detected_language, analysis_method, raw_analysis, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        analysisId,
        cardId,
        newVersion,
        analysis.detectedDomain,
        analysis.domainConfidence,
        analysis.secondaryDomains,
        analysis.extractedConcepts,
        analysis.complexityLevel,
        analysis.complexityScore,
        analysis.frontWordCount,
        analysis.backWordCount,
        analysis.detectedCardType,
        analysis.detectedLanguage,
        method,
        JSON.stringify(analysis.rawAnalysis),
        status,
      ],
    );

    return {
      analysisId,
      cardId,
      version: newVersion,
      ...analysis,
      status,
      method,
    };
  }

  /**
   * Queue a card for background analysis
   * @param {string} cardId - The card ID to queue
   * @param {object} options - Queue options
   */
  async queueCardForAnalysis(cardId, options = {}) {
    const { userId, priority = 0 } = options;

    const jobId = generateULID("job");
    await this.pool.query(
      `INSERT INTO analysis_jobs (job_id, card_id, job_type, priority, user_id)
       VALUES ($1, $2, 'single', $3, $4)
       ON CONFLICT DO NOTHING`,
      [jobId, cardId, priority, userId],
    );

    return { jobId, cardId };
  }

  /**
   * Queue an entire deck for batch analysis
   * @param {string} deckId - The deck ID to analyze
   * @param {object} options - Queue options
   */
  async queueDeckForAnalysis(deckId, options = {}) {
    const { userId, priority = 0 } = options;

    // Get card count for progress tracking
    const countResult = await this.pool.query(
      "SELECT COUNT(*) as total FROM cards WHERE deck_client_id = $1",
      [deckId],
    );
    const totalCards = parseInt(countResult.rows[0]?.total || 0);

    const jobId = generateULID("job");
    await this.pool.query(
      `INSERT INTO analysis_jobs (job_id, deck_id, job_type, priority, user_id, total_cards)
       VALUES ($1, $2, 'batch', $3, $4, $5)`,
      [jobId, deckId, priority, userId, totalCards],
    );

    return { jobId, deckId, totalCards };
  }

  /**
   * Queue cards for re-analysis based on criteria
   * @param {object} options - Re-analysis options
   */
  async queueReanalysis(options = {}) {
    const {
      domain,
      beforeDate,
      minVersion,
      userId,
      priority = 1, // Higher priority for admin re-analysis
    } = options;

    let whereClause = "1=1";
    const params = [];
    let paramIndex = 1;

    if (domain) {
      whereClause += ` AND ca.detected_domain = $${paramIndex++}`;
      params.push(domain);
    }

    if (beforeDate) {
      whereClause += ` AND ca.created_at < $${paramIndex++}`;
      params.push(beforeDate);
    }

    if (minVersion) {
      whereClause += ` AND ca.analysis_version < $${paramIndex}`;
      params.push(minVersion);
    }

    // Get cards to re-analyze
    const cardsResult = await this.pool.query(
      `SELECT DISTINCT c.card_id
       FROM cards c
       LEFT JOIN card_analysis ca ON c.card_id = ca.card_id
       WHERE ${whereClause}`,
      params,
    );

    // Queue jobs for each card
    const jobs = [];
    for (const row of cardsResult.rows) {
      const jobId = generateULID("job");
      await this.pool.query(
        `INSERT INTO analysis_jobs (job_id, card_id, job_type, priority, user_id)
         VALUES ($1, $2, 'reanalysis', $3, $4)`,
        [jobId, row.card_id, priority, userId],
      );
      jobs.push({ jobId, cardId: row.card_id });
    }

    return { queuedCount: jobs.length, jobs };
  }

  // ============================================================
  // RULE-BASED ANALYSIS
  // ============================================================

  /**
   * Run complete rule-based analysis on card content
   */
  runRuleBasedAnalysis(frontText, backText, combinedText) {
    const domainResult = this.detectDomain(combinedText);
    const complexityResult =
      CardAnalysisService.analyzeComplexity(combinedText);
    const cardType = CardAnalysisService.detectCardType(frontText, backText);
    const language = CardAnalysisService.detectLanguage(combinedText);
    const concepts = this.extractConcepts(combinedText);

    return {
      detectedDomain: domainResult.primary,
      domainConfidence: domainResult.confidence,
      secondaryDomains: domainResult.secondary,
      extractedConcepts: concepts,
      complexityLevel: complexityResult.level,
      complexityScore: complexityResult.score,
      frontWordCount: this.countWords(frontText),
      backWordCount: this.countWords(backText),
      detectedCardType: cardType,
      detectedLanguage: language,
      rawAnalysis: {
        domainScores: domainResult.scores,
        complexityFactors: complexityResult.factors,
      },
    };
  }

  /**
   * Detect content domain using keyword matching
   * Score by keyword length (longer = more specific = higher weight)
   */
  detectDomain(text) {
    const normalizedText = text.toLowerCase();
    const scores = {};
    let totalScore = 0;

    // Score each domain
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      scores[domain] = 0;

      for (const keyword of keywords) {
        // Use word boundary matching for more accurate detection
        const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, "gi");
        const matches = normalizedText.match(regex);

        if (matches) {
          // Score by keyword length (longer = more specific)
          const keywordScore = keyword.length * matches.length;
          scores[domain] += keywordScore;
          totalScore += keywordScore;
        }
      }
    }

    // Find primary domain
    let primary = "unknown";
    let maxScore = 0;

    for (const [domain, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        primary = domain;
      }
    }

    // Calculate confidence
    const confidence = totalScore > 0 ? Math.min(maxScore / totalScore, 1) : 0;

    // Find secondary domains (scores > 30% of top)
    const threshold = maxScore * this.options.secondaryDomainThreshold;
    const secondary = Object.entries(scores)
      .filter(([domain, score]) => domain !== primary && score > threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([domain]) => domain);

    return {
      primary: maxScore > 0 ? primary : "unknown",
      confidence: Math.round(confidence * 1000) / 1000,
      secondary,
      scores,
    };
  }

  /**
   * Analyze text complexity based on vocabulary and structure
   * @param {string} text - Text to analyze
   * @returns {object} Complexity analysis with level, score, and factors
   */
  static analyzeComplexity(text) {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    if (words.length === 0) {
      return { level: "elementary", score: 0, factors: {} };
    }

    // Factor 1: Average word length
    const avgWordLength =
      words.reduce((sum, w) => sum + w.length, 0) / words.length;
    const wordLengthScore = Math.min(avgWordLength / 10, 1);

    // Factor 2: Average sentence length
    const avgSentenceLength =
      sentences.length > 0 ? words.length / sentences.length : words.length;
    const sentenceLengthScore = Math.min(avgSentenceLength / 30, 1);

    // Factor 3: Vocabulary diversity (unique words / total words)
    const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
    const diversityScore = Math.min(uniqueWords.size / words.length, 1);

    // Factor 4: Long words (>= 8 characters)
    const longWords = words.filter((w) => w.length >= 8);
    const longWordScore = Math.min(longWords.length / words.length, 1);

    // Combined score (weighted average)
    const score =
      wordLengthScore * 0.25 +
      sentenceLengthScore * 0.25 +
      diversityScore * 0.25 +
      longWordScore * 0.25;

    // Map score to level
    let level = "expert";
    if (score < 0.25) {
      level = "elementary";
    } else if (score < 0.5) {
      level = "intermediate";
    } else if (score < 0.75) {
      level = "advanced";
    }

    return {
      level,
      score: Math.round(score * 1000) / 1000,
      factors: {
        avgWordLength: Math.round(avgWordLength * 100) / 100,
        avgSentenceLength: Math.round(avgSentenceLength * 100) / 100,
        vocabularyDiversity: Math.round(diversityScore * 100) / 100,
        longWordRatio: Math.round(longWordScore * 100) / 100,
      },
    };
  }

  /**
   * Detect card type based on content patterns
   * @param {string} front - Front text of the card
   * @param {string} back - Back text of the card
   * @returns {string} Detected card type (cloze, qa, definition, basic)
   */
  static detectCardType(front, back) {
    const frontLower = front.toLowerCase();
    const backLower = back.toLowerCase();

    // Cloze detection: {{c1::text}} or [...] or _____
    if (
      /\{\{c\d+::.*?\}\}/.test(front) ||
      /\[\.\.\.?\]/.test(front) ||
      /_{3,}/.test(front)
    ) {
      return "cloze";
    }

    // Q&A detection: starts with question word or ends with ?
    const questionWords = [
      "what",
      "who",
      "where",
      "when",
      "why",
      "how",
      "which",
      "whose",
      "whom",
    ];
    const startsWithQuestion = questionWords.some((w) =>
      frontLower.trim().startsWith(w),
    );
    const endsWithQuestion = front.trim().endsWith("?");

    if (startsWithQuestion || endsWithQuestion) {
      return "qa";
    }

    // Definition detection: "X is..." or "Define X" or term:definition format
    if (
      frontLower.includes(" is ") ||
      frontLower.startsWith("define ") ||
      frontLower.includes(":") ||
      backLower.startsWith("a ") ||
      backLower.startsWith("an ") ||
      backLower.startsWith("the ")
    ) {
      return "definition";
    }

    // Default to basic
    return "basic";
  }

  /**
   * Detect primary language using script detection
   * @param {string} text - Text to analyze
   * @returns {string} ISO 639-1 language code
   */
  static detectLanguage(text) {
    // Check for Japanese first (Hiragana or Katakana, with or without Kanji)
    if (/[\u3040-\u309f\u30a0-\u30ff]/u.test(text)) {
      return "ja";
    }

    // Check for Korean (Hangul)
    if (/[\uac00-\ud7af\u1100-\u11ff]/u.test(text)) {
      return "ko";
    }

    // Check for Chinese (CJK characters without Japanese kana)
    if (/[\u4e00-\u9fff]/u.test(text)) {
      return "zh";
    }

    // Check for Cyrillic (Russian, etc.)
    if (/[\u0400-\u04ff]/u.test(text)) {
      return "ru";
    }

    // Check for Arabic
    if (/[\u0600-\u06ff]/u.test(text)) {
      return "ar";
    }

    // Check for Hebrew
    if (/[\u0590-\u05ff]/u.test(text)) {
      return "he";
    }

    // Check for Greek
    if (/[\u0370-\u03ff]/u.test(text)) {
      return "el";
    }

    // Check for Devanagari (Hindi, Sanskrit)
    if (/[\u0900-\u097f]/u.test(text)) {
      return "hi";
    }

    // Check for Thai
    if (/[\u0e00-\u0e7f]/u.test(text)) {
      return "th";
    }

    // Default to English for Latin script
    return "en";
  }

  /**
   * Extract key concepts from text
   */
  extractConcepts(text) {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    // Count word frequency
    const frequency = {};
    for (const word of words) {
      frequency[word] = (frequency[word] || 0) + 1;
    }

    // Also extract multi-word phrases (bigrams)
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      bigrams.push(bigram);
    }

    for (const bigram of bigrams) {
      frequency[bigram] = (frequency[bigram] || 0) + 1;
    }

    // Sort by frequency and length (prefer longer, more specific terms)
    const concepts = Object.entries(frequency)
      .map(([term, freq]) => ({
        term,
        score: freq * Math.log(term.length + 1),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.options.maxConcepts)
      .map((c) => c.term);

    return concepts;
  }

  // ============================================================
  // LLM ANALYSIS (STUB)
  // ============================================================

  /**
   * Run LLM analysis for ambiguous cases
   * Returns placeholder - implement with actual LLM integration
   */
  static runLLMAnalysis(_frontText, _backText) {
    // TODO: Implement LLM integration
    // This would call an LLM API (e.g., Claude) for more sophisticated analysis
    return Promise.resolve({
      status: "not_implemented",
      message: "LLM analysis not yet implemented",
    });
  }

  /**
   * Merge rule-based and LLM analysis results
   */
  mergeAnalysis(ruleAnalysis, llmAnalysis) {
    // If LLM provided better results, use those
    if (
      llmAnalysis.status === "completed" &&
      llmAnalysis.confidence > ruleAnalysis.domainConfidence
    ) {
      return {
        ...ruleAnalysis,
        detectedDomain: llmAnalysis.domain,
        domainConfidence: llmAnalysis.confidence,
        extractedConcepts:
          llmAnalysis.concepts || ruleAnalysis.extractedConcepts,
        rawAnalysis: {
          ...ruleAnalysis.rawAnalysis,
          llmAnalysis,
        },
      };
    }

    return ruleAnalysis;
  }

  // ============================================================
  // QUERY METHODS
  // ============================================================

  /**
   * Get analysis for a card
   */
  async getCardAnalysis(cardId) {
    const result = await this.pool.query(
      `SELECT * FROM card_analysis
       WHERE card_id = $1
       ORDER BY analysis_version DESC
       LIMIT 1`,
      [cardId],
    );

    return result.rows[0] || null;
  }

  /**
   * Get backlog status (pending jobs)
   */
  async getBacklogStatus() {
    const result = await this.pool.query(
      `SELECT
        status,
        job_type,
        COUNT(*) as count
       FROM analysis_jobs
       WHERE status IN ('pending', 'processing')
       GROUP BY status, job_type`,
    );

    const summary = {
      pending: 0,
      processing: 0,
      byType: {},
    };

    for (const row of result.rows) {
      summary[row.status] = (summary[row.status] || 0) + parseInt(row.count);
      summary.byType[row.job_type] = summary.byType[row.job_type] || {
        pending: 0,
        processing: 0,
      };
      summary.byType[row.job_type][row.status] = parseInt(row.count);
    }

    return summary;
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Extract plain text from card content (which may be JSON or HTML)
   */
  extractTextFromContent(content) {
    if (!content) return "";

    // If content is a string that looks like JSON, parse it
    if (typeof content === "string") {
      try {
        const parsed = JSON.parse(content);
        if (parsed.html) {
          return this.stripHtml(parsed.html);
        }
        if (typeof parsed === "string") {
          return this.stripHtml(parsed);
        }
      } catch {
        // Not JSON, treat as plain text or HTML
        return this.stripHtml(content);
      }
    }

    // If it's an object with html property
    if (content.html) {
      return this.stripHtml(content.html);
    }

    // If it's an object, try to get text
    if (typeof content === "object") {
      return this.stripHtml(JSON.stringify(content));
    }

    return String(content);
  }

  /**
   * Strip HTML tags from text
   * @param {string} html - HTML string to strip
   * @returns {string} Plain text with HTML tags removed
   */
  stripHtml(html) {
    return (
      html
        // NOSONAR: This regex is safe - [^>]* is a negated character class that cannot
        // match >, so there's no backtracking. It runs in O(n) linear time.
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // &amp; must be unescaped LAST to avoid double-unescaping (e.g., &amp;lt; → &lt; → <)
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  /**
   * Count words in text
   */
  countWords(text) {
    return text.split(/\s+/).filter((w) => w.length > 0).length;
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

export default CardAnalysisService;
