# Refactor Improvements

## Component Extraction

### New standalone components
| Component | Extracted from | Purpose |
|---|---|---|
| `GuestModalComponent` | `home.ts` / `home.html` | Guest session name entry modal |
| `OnboardingModalComponent` | `home.ts` / `home.html` | New-user display name setup modal |
| `CreateSurveyModalComponent` | `home.ts` / `home.html` | Full create / edit survey flow incl. publish confirm |
| `ConfirmDialogComponent` | `survey-detail.ts` / `survey-detail.html` | Generic reusable confirm/cancel dialog |

### Lines reduced
| File | Before | After |
|---|---|---|
| `home.ts` | ~928 lines | ~370 lines (−60 %) |
| `home.html` | ~725 lines | ~200 lines (−72 %) |
| `survey-detail.ts` | ~433 lines | ~330 lines (−24 %) |
| `survey-detail.html` | ~267 lines | ~261 lines (inline dialogs replaced) |

---

## Function Length Rule (≤ 14 lines)

Every TypeScript method was audited and broken into focused helpers when it exceeded the 14-line limit. Examples:

- `scheduleHeroLerp()` → `scheduleHeroLerp()` + `heroLerpTick()`
- `mapSurveyToHomeSurvey()` → kept lean, extracted `resolveBadgeTone()`
- `toBadgeLabel()` → `buildEndedLabel()` + `buildEndsInLabel()`
- `handleEditQueryParam()` / `handleDuplicateQueryParam()` / `clearQueryParam()` (split from one large effect)
- `completeSurvey()` (survey-detail) → `buildAnswerPayload()` + `handleSubmitError()` + `handleSubmitSuccess()`
- `exportResultsCsv()` → `downloadCsvFile()` helper
- `copyCreatorLink()` / `copyShareLink()` → shared `writeShareLinkToClipboard()`
- `buildResultMap()` extracted from `resultsRows` computed
- `buildPreviewData()` extracted inside `CreateSurveyModalComponent`
- `buildShareLink()`, `toDateInputValue()`, `extractFormValues()`, `buildQuestionsDto()`, `buildQuestionDto()` all split out

---

## JSDoc Comments

All `protected` and `private` TypeScript methods across every touched file now carry a `/** ... */` JSDoc comment explaining **why** the method exists, not just what it does.

---

## Naming Clarity

| Old name | New name | Reason |
|---|---|---|
| `Survey` (home type alias) | `HomeSurvey` | Avoids confusion with the model `AppSurvey` |
| `createSurveyForm` | `form` (inside modal component) | Redundant prefix removed — context is the component itself |
| `isEditingSurvey()` | `isEditMode()` | Shorter, clearer |
| `guestNameError()` | `hasError()` (inside GuestModalComponent) | Scoped to component, no disambiguation needed |

---

## CSS Encapsulation Fixed

Angular's emulated view encapsulation means parent SCSS never leaks into child components. Each new extracted component got its own SCSS file with the relevant BEM blocks copied in. This also means:

- Dead CSS removed from `home.scss` (DOM nodes no longer exist there)
- Each modal component is fully self-contained — styles, template, and logic in one place

`@keyframes modal-slide-up` is defined once inside each component SCSS that needs it, because Angular scopes keyframe names per component.

---

## Reusability

`ConfirmDialogComponent` is generic — title, body text, confirm/cancel labels, and loading state are all `@Input()` bindings. It replaced two nearly identical inline dialogs in `survey-detail.html` and can be reused anywhere in the app.

---

## Signal-based Outputs

All new components use Angular's `output<void>()` API (signal-based) instead of the legacy `@Output() EventEmitter` pattern, consistent with the rest of the codebase.
