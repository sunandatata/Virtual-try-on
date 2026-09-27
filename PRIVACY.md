# Virtual Try-On Privacy Notice (MVP Draft)

**Effective date:** 2026-09-26

Virtual Try-On processes images only to create a user-requested clothing preview.

## Data handled

- A body photo chosen by the user.
- A garment image explicitly selected from the current page or uploaded by the user.
- The selected garment category, an optional private-MVP access code, and technical job/status identifiers.
- The configured backend origin. The extension does not include or store the virtual try-on provider API key.

## Storage and transmission

The preferred body photo, recent garment, and downloaded result are stored locally in the extension's private IndexedDB. The extension does not inject the body photo into shopping pages. Images are not transmitted when a photo is added or a garment is selected. Both images and the category are sent to the configured backend only after the user presses **Generate try-on**.

The backend validates and forwards submitted images to the configured try-on provider for transient processing. It does not intentionally store images in a database, permanent object store, or log. FASHN's own retention and processing terms apply when that provider is enabled; review and link its current policy before public release. Result links are short-lived and proxied through a signed backend route.

## Page access

The garment picker is injected only after an explicit user action and removes its UI/listeners after selection or cancellation. The extension does not perform background page collection, scrape product catalogs, track prices, or inspect browsing history. A right-click image is processed only when the user chooses the Virtual Try-On menu item.

## Deletion and control

Users can replace or delete the body photo, remove a garment, start over, or clear all locally stored extension data from Settings. Uninstalling the extension also removes its local storage under Chrome's normal extension-data behavior.

## Accuracy and sensitive data

Results are visual approximations and do not guarantee sizing, measurements, fit, fabric behavior, or appearance. Users must upload only photos they own or have permission to process. Body images should be treated as sensitive personal data.

## Security

The extension uses bundled code, restrictive Manifest V3 content security policy, typed message validation, optional backend-origin permissions, and no remotely hosted executable code. The backend applies exact CORS allowlisting, format/size/decode validation, signed expiring job tokens, access control where configured, and rate limiting.

## Publisher details

Before Chrome Web Store publication, replace this section with the publisher's legal name, contact email, deployed privacy-policy URL, provider/subprocessor details, retention commitments, and applicable regional rights process.
