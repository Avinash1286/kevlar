# Nova custom collector

This directory is the source-controlled definition of the first custom Scraper Studio Browser worker. It is not a prebuilt library scraper.

`interaction.js` tags the public JSON-LD, the public product API response, and a screenshot before calling the parser. `parser.js` extracts visible purchase and financing values separately and retains their context.

The code follows the current official Scraper Studio interaction/parser model. It must still be pasted, previewed, manually inspected, and saved in the account IDE. Until then, `collector-id.txt` intentionally remains pending and no live baseline is claimed.

Do not commit the Bright Data API token. Store the creation transcript only after redacting account identifiers and credentials.
