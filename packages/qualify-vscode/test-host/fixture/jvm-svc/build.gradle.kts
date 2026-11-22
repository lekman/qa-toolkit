plugins {
    java
}

dependencies {
    testImplementation("com.lekman:qualify:0.1.0")
}

tasks.test {
    useJUnitPlatform()
}
