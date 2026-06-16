/**
 * Must load before https://www.aem.live/tools/sidekick/library/index.js
 *
 * Upstream blocks.js reads e.details.path but block-list dispatches e.detail.path.
 * PreviewBlock does not bubble, so a document-level listener cannot intercept it.
 */
const nativeDispatch = EventTarget.prototype.dispatchEvent;

EventTarget.prototype.dispatchEvent = function dispatchEvent(event) {
  if (event?.type === 'PreviewBlock' && event.detail && event.details === undefined) {
    Object.defineProperty(event, 'details', { value: event.detail, configurable: true });
  }
  return nativeDispatch.call(this, event);
};
