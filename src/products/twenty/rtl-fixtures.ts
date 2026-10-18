import { createFilteredPeopleView, createPersonWithJob } from "./fixtures/live-records.js";
import { destroyPerson } from "./fixtures/records.js";
import { memberApi } from "./fixtures/qa-member.js";
import { destroyView } from "./fixtures/views.js";
import { test as visualTest } from "./visual-fixtures.js";

export interface RtlPerson {
  readonly id: string;
  readonly firstName: string;
  readonly jobTitle: string;
  /** A People table view filtered to this person; its name stays under the P1-QA- sweep prefix. */
  readonly viewId: string;
}

/** Fixed names so baselines show no seed. Visual runs use one worker, so one exists at a time. */
const RTL_FIRST_NAME = "P1-QA-RTL-سارة";
const RTL_JOB_TITLE = "مدير QA 2026";
const RTL_VIEW_NAME = "P1-QA-RTL-People";

export const test = visualTest.extend<{ rtlPerson: RtlPerson }>({
  rtlPerson: async ({ twentyQaMember }, use) => {
    const api = memberApi(twentyQaMember);
    const errors: unknown[] = [];
    const person = await createPersonWithJob(api, RTL_FIRST_NAME, "العتيبي 42", RTL_JOB_TITLE);
    let viewId: string | undefined;
    try {
      // The Filter button is translated under ar-SA, so the list is scoped by a view, not the filter UI.
      viewId = (await createFilteredPeopleView(api, RTL_VIEW_NAME, "P1-QA-RTL")).id;
      await use({ id: person.id, firstName: RTL_FIRST_NAME, jobTitle: RTL_JOB_TITLE, viewId });
    } catch (e) {
      errors.push(e);
    }
    if (viewId !== undefined) {
      try {
        await destroyView(api, viewId);
      } catch (e) {
        errors.push(e);
      }
    }
    try {
      await destroyPerson(api, person.id);
    } catch (e) {
      errors.push(e);
    }
    if (errors.length > 0) throw new AggregateError(errors, "rtlPerson failed");
  },
});
export { expect } from "@playwright/test";
