import { CardQueue } from "./card-queue";

export class IdeaHints {
  private queue: CardQueue;

  constructor() {
    this.queue = new CardQueue("right", 7);
  }

  addIdea(idea: { character: string; meaning: string }) {
    this.queue.add(idea);
  }
}
