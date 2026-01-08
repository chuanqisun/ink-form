import { CardQueue } from "./card-queue";

export class History {
  private queue: CardQueue;

  constructor() {
    this.queue = new CardQueue("left", 7);
  }

  addCharacter(entry: { character: string; meaning: string }) {
    this.queue.add(entry);
  }
}
