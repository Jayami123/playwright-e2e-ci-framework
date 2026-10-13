import { type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";

export class TwentyHomePage extends BasePage {
  readonly companiesLink: Locator;
  readonly peopleLink: Locator;

  constructor(page: Page) {
    super(page);
    this.companiesLink = page.getByRole("link", { name: "Companies", exact: true });
    this.peopleLink = page.getByRole("link", { name: "People", exact: true });
  }
}
