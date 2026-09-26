# Disclosures

- We don't use tsconfig paths, because of examples (the prisma generate don't support paths)

# Changelog and versioning

The changelog ([CHANGELOG.md](./CHANGELOG.md)) is generated with [Changesets](https://github.com/changesets/changesets). Do not edit it by hand: every change that users of the package should know about needs a changeset.

## Adding a changeset

1. Run `bun run changeset`.
2. Pick the bump type:
   - `major`: breaking change (peer dependencies, removed or changed options, changed generated code).
   - `minor`: new feature, backwards compatible.
   - `patch`: fix, docs, or an internal change worth mentioning.
3. Write the summary as it should read in the changelog (start with `Feature:`, `Fix:`, `Docs:`...). It supports Markdown and multiple lines.
4. Commit the generated file in `.changeset/` together with the change. It is committed with the code so the changelog entry links to the commit hash.

You can add more than one changeset per pull request, and `bun run changeset status` shows what would be released. Changes that don't affect users (tests, CI) don't need one.

## Generating the changelog

```sh
bun run version
```

`changeset version` reads the pending changesets, bumps `version` in `package.json` to the highest bump type, prepends a section to `CHANGELOG.md` and deletes the consumed changesets. Review and commit the result. This does not publish anything: publishing stays manual with `bun run pub`.

Changesets needs Node.js 22 or newer.
