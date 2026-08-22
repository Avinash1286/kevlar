# Nova custom collector

This directory is the source-controlled definition of the first custom Scraper Studio Browser worker. It is not a prebuilt library scraper.

`interaction.js` tags the public JSON-LD, the public product API response, and a screenshot before calling the parser. `parser.js` extracts visible purchase and financing values separately and retains their context.

The collector is published as `kevlar-nova-product-pricing` with stable platform ID `c_mt3utzwt29hbznvax9`. The repository retains the reviewed interaction/parser source and the same ID used by collection, self-healing, approval, and certification runs.

Do not commit the Bright Data API token. Store all operational evidence only after redacting account identifiers and credentials.
