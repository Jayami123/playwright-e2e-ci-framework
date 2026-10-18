import { expect, type Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { twentyTimeouts } from "../env.js";

export type KanbanStage = "New" | "Screening" | "Meeting" | "Proposal" | "Customer";

export class TwentyKanbanPage extends BasePage {
  async goto(viewId: string): Promise<void> {
    await this.gotoPath(`/objects/opportunities?viewId=${viewId}`);
    await expect(this.columnHeader("New")).toBeVisible({ timeout: twentyTimeouts().page });
  }

  columnHeader(stage: KanbanStage): Locator {
    // Only the header has aria-expanded; each column also has a "New" add-record button.
    return this.page.getByRole("button", { name: stage, exact: true, expanded: false });
  }

  card(name: string): Locator {
    return this.page.getByRole("button", { name, exact: true });
  }

  /** Mouse steps: locator.dragTo never moved a card (0 of 5), 20 linear steps did (25 of 25). */
  async dragCardToColumn(name: string, stage: KanbanStage): Promise<void> {
    const card = await this.card(name).boundingBox();
    const header = await this.columnHeader(stage).boundingBox();
    if (card === null || header === null) throw new Error("kanban card or column has no box");
    await this.page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(header.x + 40, header.y + header.height + 60, { steps: 20 });
    await this.page.mouse.up();
  }
}
