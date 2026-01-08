import "./idea-hints.css";

export class IdeaHints {
  private container: HTMLDivElement;
  private maxVisibleCards = 7;
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

    // Synchronously update list and DOM to prevent race conditions during rapid calls
    this.container.prepend(card);
    this.cards.unshift(card);

    const fullHeight = card.offsetHeight;
    const gap = 12;

    // Combined entry animation: Expand, fade, and slide in one smooth motion
    card.animate(
      [
        {
          height: "0px",
          opacity: 0,
          transform: "translateX(20px) scale(0.9)",
          marginBottom: "0px",
          paddingTop: "0px",
          paddingBottom: "0px",
          borderWidth: "0px",
        },
        {
          height: `${fullHeight}px`,
          opacity: 1,
          transform: "translateX(0) scale(1)",
          marginBottom: `${gap}px`,
          paddingTop: "12px",
          paddingBottom: "12px",
          borderWidth: "1px",
        },
      ],
      {
        duration: 500,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        fill: "forwards",
      }
    );

    // Immediately handle removal of oldest card if over limit
    if (this.cards.length > this.maxVisibleCards) {
      const oldestCard = this.cards.pop();
      if (oldestCard) {
        oldestCard
          .animate(
            [
              { opacity: 1, transform: "scale(1)", height: `${oldestCard.offsetHeight}px` },
              {
                opacity: 0,
                transform: "scale(0.9) translateX(20px)",
                height: "0px",
                marginBottom: "0px",
                paddingTop: "0px",
                paddingBottom: "0px",
                borderWidth: "0px",
              },
            ],
            {
              duration: 400,
              easing: "ease-in",
              fill: "forwards",
            }
          )
          .finished.then(() => oldestCard.remove());
      }
    }
  }
}
