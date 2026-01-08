import "./card-queue.css";

export interface CardEntry {
  character: string;
  meaning: string;
}

export type QueueSide = "left" | "right";

export class CardQueue {
  private container: HTMLDivElement;
  private maxVisibleCards: number;
  private cards: HTMLDivElement[] = [];
  private side: QueueSide;

  constructor(side: QueueSide = "left", maxVisibleCards = 7) {
    this.side = side;
    this.maxVisibleCards = maxVisibleCards;
    this.container = document.createElement("div");
    this.container.className = `card-queue-container ${side}`;
    document.body.appendChild(this.container);
  }

  add(entry: CardEntry) {
    const card = document.createElement("div");
    card.className = "card-queue-card";

    const characterEl = document.createElement("div");
    characterEl.className = "card-queue-character";
    characterEl.textContent = entry.character;

    const meaningEl = document.createElement("div");
    meaningEl.className = "card-queue-meaning";
    meaningEl.textContent = entry.meaning;

    card.appendChild(characterEl);
    card.appendChild(meaningEl);

    // Synchronously update list and DOM
    this.container.prepend(card);
    this.cards.unshift(card);

    const fullHeight = card.offsetHeight;
    const gap = 12;
    const moveX = this.side === "left" ? "-20px" : "20px";

    // Entry animation
    card.animate(
      [
        {
          height: "0px",
          opacity: 0,
          transform: `translateX(${moveX}) scale(0.9)`,
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

    // Handle removal of oldest card if over limit
    if (this.cards.length > this.maxVisibleCards) {
      const oldestCard = this.cards.pop();
      if (oldestCard) {
        oldestCard
          .animate(
            [
              { opacity: 1, transform: "scale(1)", height: `${oldestCard.offsetHeight}px` },
              {
                opacity: 0,
                transform: `scale(0.9) translateX(${moveX})`,
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
