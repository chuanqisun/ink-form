
export class IdeaHints {
  private container: HTMLDivElement;
  private maxVisibleCards = 8;
  private cards: HTMLDivElement[] = [];

  constructor() {
    this.container = document.createElement("div");
    this.container.className = "idea-hints-container";
    document.body.appendChild(this.container);
  }

  addIdea(idea: { character: string; meaning: string }) {
    const card = document.createElement("div");
    card.className = "idea-card";

    const characterEl = document.createElement("div");
    characterEl.className = "idea-character";
    characterEl.textContent = idea.character;

    const meaningEl = document.createElement("div");
    meaningEl.className = "idea-meaning";
    meaningEl.textContent = idea.meaning;

    card.appendChild(characterEl);
    card.appendChild(meaningEl);

    this.container.appendChild(card);
    this.cards.push(card);

    if (this.cards.length > this.maxVisibleCards) {
      const oldestCard = this.cards.shift();
      if (oldestCard) {
        oldestCard.classList.add("fade-out");
        setTimeout(() => {
          oldestCard.remove();
        }, 500); // Match animation duration
      }
    }
  }
}
