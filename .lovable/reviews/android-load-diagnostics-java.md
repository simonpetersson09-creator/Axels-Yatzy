# Android banner diagnostics: Java compilation verification

Date: 2026-11-24. Scope: diagnostics patch and regression tests only.

## Root cause

At commit `4ef339e8`, `String.replace` matched the first occurrence of
`final ViewGroup bannerParent = resolveViewGroup();` in the entire banner file.
That occurrence belongs to `removeBanner`, not `onAdFailedToLoad`, so its inserted
`reportLoadFailure(adError)` referred to an undefined callback parameter.
The existing helper marker prevented a second run from repairing the bad call.
Previous tests checked instrumentation removal/idempotence, not Java scope.

## Correction

The banner-only normalizer removes existing diagnostic calls with that argument,
locates the unique typed load-failure callback, verifies its existing stale-view
return precedes teardown, and inserts the diagnostic call there. It runs even
when the helper marker already exists; missing/ambiguous callback anchors fail
without writing that file. Existing helpers, event payloads and all non-diagnostic
control flow are unchanged. The iOS transforms and interstitial hook are unchanged.

## Actual compiler evidence

An isolated project under `/tmp/android-diagnostics-check` included the real
Capacitor Android library and AdMob Android library, not Java stubs.

- AdMob npm package: **8.2.1**, archive SHA-512 matched `package-lock.json`.
- JDK **21.0.13**, Gradle **8.13**, Android Gradle Plugin **8.13.0**.
- Android compile SDK **36**, build tools **36.0.0**.
- Existing plugin dependency declarations unchanged; its existing `25.4.+`
  Google Mobile Ads declaration resolved to **25.4.0**.
- Task: `:capacitor-community-admob:compileReleaseJavaWithJavac`.
- Before correction: task failed at `BannerExecutor.java:356`,
  `cannot find symbol`, `symbol: variable adError`.
- Previously patched installation after correction: **BUILD SUCCESSFUL**.
- Clean verified npm archive, entire existing Android patch chain: **BUILD SUCCESSFUL**.
- Entire patch chain repeated: source hashes identical; task run again with
  `--rerun-tasks`: **BUILD SUCCESSFUL**, all 18 tasks executed.
- Five targeted test files: **19 passed**, no skipped Java regression.
- Installed plugin repaired; all installed iOS file contents hash-identical.

## Re-running the permanent compiler regression

`src/lib/patch-admob-load-diagnostics.test.ts` includes a real `javac` test. It
requires JDK 21 on PATH and `MRB_ANDROID_JAVA_CLASSPATH` containing the release
compiler classpath plus the compiled plugin's Java output directory. Without
that environment variable, only that integration test is explicitly skipped;
the normal patch tests still run. It compiles complete banner/interstitial
fixture classes against real dependencies, rejects the old misplaced call,
then compiles clean, repeated and repaired patches and checks byte stability.

Export the classpath with a temporary Gradle init script:

```groovy
gradle.projectsEvaluated {
    def p = gradle.rootProject.project(':capacitor-community-admob')
    p.tasks.named('compileReleaseJavaWithJavac').configure {
        doLast {
            def paths = classpath.files.collect { it.absolutePath }
            paths.add(destinationDirectory.get().asFile.absolutePath)
            new File('/tmp/admob-release-classpath.txt').text = paths.join(File.pathSeparator)
        }
    }
}
```

```sh
./gradlew -I /tmp/export-classpath.gradle :capacitor-community-admob:compileReleaseJavaWithJavac --rerun-tasks
MRB_ANDROID_JAVA_CLASSPATH="$(cat /tmp/admob-release-classpath.txt)" bunx vitest run src/lib/patch-admob-load-diagnostics.test.ts
```

No production changes, SDK version changes, UMP/ATT changes, iOS changes,
ad-behavior changes or app publication. A complete signed application/AAB was
not built: the verification covers actual release compilation of the affected
native library and its real dependencies. Before the next app build, update
the local checkout and run the existing `npm run cap:sync:android` command.