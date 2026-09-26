---
"@wokcito/prisma-generator-pothos-codegen": patch
---

Fix: 1.1.0 was published from the repository root instead of `dist`, so the package contained the TypeScript sources, tests, examples and internal documents, and no compiled JavaScript: `main`, `bin` and `./runtime` pointed to files that did not exist and the package could not be used. This version has the same code as 1.1.0, built and published from `dist`. Do not use 1.1.0.

Publishing: `bun run pub` now runs the tests and the build before publishing from `dist`.
