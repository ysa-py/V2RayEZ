pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

// Unified product naming: the Gradle project name matches the canonical
// display name "V2RayEZ" (app_name string, APK artifact names, brand assets).
rootProject.name = "V2RayEZ"
include(":app")
include(":license-admin")
