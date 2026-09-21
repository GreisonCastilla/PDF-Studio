/** Brings a page into view in the main stage. */
export function scrollToPage(pageId: string, block: ScrollLogicalPosition = 'center') {
  document
    .querySelector(`[data-page="${pageId}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block })
}
