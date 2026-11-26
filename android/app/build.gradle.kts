// Etiquetas PM270 · Copyright (C) 2026 ALIALAB · SPDX-License-Identifier: AGPL-3.0-only
// App Android de Etiquetas PM270: la misma web (carpeta ../../web) dentro de
// una ventana propia, con Bluetooth nativo para hablar con la impresora.
plugins {
    id("com.android.application")
}

val numero = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
// La versión se lee de web/version.js para que web y APK digan siempre lo mismo.
val versionWeb = Regex("APP_VERSION\\s*=\\s*\"([^\"]+)\"")
    .find(rootProject.file("../web/version.js").readText())!!.groupValues[1]
val esPrueba = System.getenv("GITHUB_REF_NAME") != "main"
// versionCode crece con la versión (1.0.0 -> 10000xxx) y no depende del repositorio:
// así una APK nueva siempre se instala encima, aunque el contador de GitHub vuelva a 1.
val partes = (versionWeb.split(".").map { it.toIntOrNull() ?: 0 } + listOf(0, 0, 0)).take(3)
val codigo = (partes[0] * 10000 + partes[1] * 100 + partes[2]) * 1000 + numero % 1000

android {
    namespace = "es.etiquetas.pm270"
    compileSdk = 36

    defaultConfig {
        applicationId = "es.etiquetas.pm270"
        minSdk = 26
        targetSdk = 36
        versionCode = codigo
        versionName = if (esPrueba) "$versionWeb-prueba.$numero" else versionWeb
    }

    // Sin firma aquí: la APK se firma en GitHub en un paso aparte (ver .github/workflows/apk.yml),
    // para que Gradle no reciba nunca la clave.
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/web"))
}

// Copia la web a los recursos de la app (assets/www), sin lo que solo sirve en el PC.
val copiarWeb by tasks.registering(Sync::class) {
    from(rootProject.file("../web")) {
        exclude("*.bat", "Logo.png", "Logo_t.png", "Logo_t.ico", "sw.js")
    }
    into(layout.buildDirectory.dir("generated/web/www"))
}
tasks.named("preBuild") { dependsOn(copiarWeb) }

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
}
