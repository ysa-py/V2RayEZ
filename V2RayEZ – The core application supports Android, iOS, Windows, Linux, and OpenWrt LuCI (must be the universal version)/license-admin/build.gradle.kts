plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.v2rayez.licenseadmin"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.v2rayez.licenseadmin"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
    }
}
