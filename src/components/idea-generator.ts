/**
 * Uses gemini-3-flash-preview JSON structured output to suggest 5-7 concepts based on previously recognized concepts.
 * The suggestioned concepts must be relevant to Chinese traditional culture and painting
 * Each concept is a single Chinese character
 */
export function startIdeaGeneration(recognizedConcepts: Observable<string>): Observable<{ chineseCharacter: string; meaning: string }> {}
