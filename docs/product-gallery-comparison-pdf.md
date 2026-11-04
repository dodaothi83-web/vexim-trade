# Product gallery and comparison PDF

## Single-image gallery

The zoom button now absolutely fills the aspect-ratio image container, rather than
using a percentage height in normal flow. This removes dependence on percentage-height
resolution for a single-image gallery without the thumbnail grid. The empty-photo
placeholder fills the same container. Multi-image thumbnails, swipe, lightbox and
save/share controls are retained.

Responsive Chromium checks used the actual React gallery with production Tailwind CSS
and fixture images at widths 320, 375, 390, 768 and 1280px. The main image had nonzero,
square bounds; mobile tap/lightbox and the multi-photo rail also passed. These are
isolated component checks, not a physical iPhone/Safari or production-data verification.
The previous normal-flow layout also rendered in Chromium, so the reported mobile
failure was not independently reproduced on the user's browser.

## PDF export

The product comparison table has a Download PDF button. The PDF engine and bundled
Roboto fonts are lazy-loaded only on click. No external image/font service, print dialog,
DOM screenshot or database migration is required. Only the existing buyer-safe product
comparison projection is exported. The export is a text-based comparison, not a screenshot;
it includes the displayed criteria, caution notes, verification scope and product links.

- A4 landscape for two or three product columns.
- Fixed 15mm content margins, running brand header and numbered footer within the margins.
- Repeating column headers and automatic line wrapping/page breaks.
- Long rows can continue across pages rather than being clipped or silently truncated.
- Embedded Unicode fonts support Vietnamese names.
- A busy state prevents duplicate clicks; errors show a retry message.

`npm run check:comparison-pdf` generates real PDFs and parses all pages with PDF.js.
It checks A4 dimensions, horizontal/vertical text bounds, Unicode, repeated headers,
page numbering, no blank pages and final text markers. Normal two/three-product samples
produce two pages; a deliberately oversized cell plus 35 long specification rows
produces fourteen pages without losing the final markers.

A Chromium mobile component check also exercised the actual PDF button and lazy imports,
downloaded the file and verified the PDF signature. PDF generation does not depend on
mobile viewport dimensions. Product images are not included in this text-based export.
