# qat-006: qualify, Release Automation

> **Status:** Dispatched | **Date:** 2026-11-20 | **Author:** planning session | **Keys:** qat-006

## Context

The four qualify packages publish to four registries. npm already works in
this repository through release-please and npm trusted publishing in `cd.yml`.
This brief adds the Python, Java and C# packages to release-please and
publishes them to PyPI (trusted publishing), Maven Central (Central Portal) and
NuGet. It starts after qat-003, qat-004, qat-005 and qat-007 are merged.

## Already Done, Do Not Redo

- `.github/workflows/cd.yml` runs release-please and publishes released npm
  packages with npm trusted publishing (OIDC, no token). The trusted publisher
  on npmjs.com is bound to the file name `cd.yml`; do not rename it.
- `.github/release-config.json` and `.github/release-manifest.json` configure
  release-please for `packages/data-sampler`.

## Owner Prerequisites

The implementation session cannot do these. List them in the pull request as
Do items for the operator, and do not mark the work done until each is
confirmed:

1. **npm**: add a trusted publisher for `@lekman/qualify` on npmjs.com, bound
   to `lekman/qa-toolkit`, workflow `cd.yml`.
2. **PyPI**: create a pending trusted publisher for project `lekman-qualify`,
   owner `lekman`, repository `qa-toolkit`, workflow `cd.yml`, environment
   `pypi`.
3. **Maven Central**: verify the `com.lekman` namespace on
   central.sonatype.com (DNS TXT record on `lekman.com`), create a Central
   Portal user token, and create a GPG signing key. Store
   `MAVEN_CENTRAL_USERNAME`, `MAVEN_CENTRAL_PASSWORD`, `SIGNING_KEY` and
   `SIGNING_PASSWORD` as secrets on a `maven-central` environment.
4. **NuGet**: reserve the `Lekman.` package ID prefix on nuget.org if wanted,
   and set up publishing for `Lekman.Qualify`: a trusted publishing policy
   bound to `lekman/qa-toolkit` and `cd.yml` if nuget.org offers it for the
   account, otherwise an API key scoped to `Lekman.Qualify` stored as
   `NUGET_API_KEY` on a `nuget` environment. The implementation session checks
   which nuget.org supports at the time and states it in the pull request.

## Steps

1. Add `packages/qualify`, `packages/qualify-python` (release type `python`),
   `packages/qualify-jvm` (release type `simple`, with the version in
   `gradle.properties` as an extra file) and `packages/qualify-dotnet` (release
   type `simple`, with the version in `Directory.Build.props` as an extra file)
   to release-please, keeping each package's version independent.
2. In `cd.yml`, keep the npm publish job and add three jobs that run only when
   their package was released: PyPI with `pypa/gh-action-pypi-publish` and
   OIDC (environment `pypi`, `id-token: write`), and Maven Central with the
   `com.vanniktech.maven.publish` Gradle plugin targeting the Central Portal
   (environment `maven-central`), and NuGet with `dotnet pack` and
   `dotnet nuget push` (environment `nuget`). Pin every action to a commit SHA with a
   version comment.
3. Give each package what its registry requires: PyPI metadata (readme,
   classifiers, project URLs); Maven POM metadata (name, description, URL,
   MIT licence, developer, SCM), sources and Javadoc jars, and signing.
4. Dry runs: `uv build` and `twine check`; `./gradlew publishToMavenLocal` and
   check the POM and signatures; `dotnet pack` and inspect the `.nupkg`
   (README, licence expression, symbols); `npm publish --dry-run` for the
   TypeScript package. Record the results in Outcome.
5. Update each package README with its registry badge and install line once
   published, and change the root README status for qualify.

## Failure Interpretation

- A PyPI "invalid-publisher" error means the pending publisher's workflow name
  or environment does not match `cd.yml` and `pypi` exactly.
- A Central Portal "namespace not verified" error is the owner prerequisite,
  not a build fault.

## Outcome

_Empty at dispatch._
