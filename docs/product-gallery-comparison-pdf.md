# Product gallery and comparison PDF

## Single-image gallery

After a further iPhone report in which thumbnails remained visible but the hero
collapsed, the gallery no longer uses CSS Grid for the mobile image/thumbnail stack.
Mobile uses a flex column; the two-column grid is retained only from the `sm` breakpoint.
The hero's height is reserved by an in-flow `padding-top: 100%` spacer, not `aspect-ratio`.
The zoom button, image layers and empty-photo placeholder fill that reserved box.
This addresses both single-image and multi-image layouts without percentage-height
resolution depending on an intrinsically sized grid row.

The original absolute-button change alone was insufficient on the reported device.
Current regression checks verify the flex-column layout, physical spacer, desktop rail,
image projection, swipe and lightbox behavior. Physical iPhone/WebKit verification of
this follow-up is still needed; do not infer it from the previous Chromium checks.

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
