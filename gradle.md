# Set directory of source set
# https://docs.gradle.org/current/userguide/java_plugin.html#sec%3asource_sets
sourceSets {
    main {
        java {
            srcDir 'src/java'
        }
        resources {
            srcDir 'src/resources'
        }
    }
}

# Peer not authenticated
# http://stackoverflow.com/questions/22887829/peer-not-authenticated-while-importing-gradle-project-in-eclipse
keytool -import -alias <the short name of the server> -file <cert_file_name_you_exported.cer> -keystore cacerts -storepass changeit

# Excute main class via: gradle run
# http://stackoverflow.com/questions/21358466/gradle-to-execute-java-class-without-modifying-build-gradle
apply plugin:'application'
mainClassName = "org.gradle.sample.Main"

# Download source in Intellij Idea

apply plugin: 'idea'

idea {
    module {
        downloadJavadoc = true
        downloadSources = true
    }
}

# Add github repo as dependency
# http://stackoverflow.com/questions/18748436/is-it-possible-to-declare-git-repository-as-dependency-in-android-gradle

repositories {
    // ...
    maven { url "https://jitpack.io" }
}
dependencies {
    compile 'com.github.User:Repo:Tag'
    compile 'com.github.davidheryanto:jung-graph-tinker3:master-SNAPSHOT'
}

# Add local jar library
repositories {
    flatDir {
        dirs 'lib'
    }
}

# Set custom url for remote Maven repository 
repositories {
    maven {
        url "http://repo1.maven.org/maven2"
    }
}

# Useful artifacts, e.g. apache-commons-collections
'org.apache.commons:commons-collections4:4.1'
'com.google.guava:guava:19.0'

# build.gradle for Java EE
apply plugin: 'war'

repositories {
    mavenCentral()
}

dependencies {
    compile 'javax:javaee-api:7.0'
}

# Build jar: one fat jar with shadow plugin and Main class 
# http://imperceptiblethoughts.com/shadow/
# http://stackoverflow.com/questions/21721119/creating-runnable-jar-with-gradle
> Add this to the top of .gradle file: 
plugins {
    id 'com.github.johnrengelman.shadow' version '1.2.3'
}
> After apply plugin: 'java'. Change 'Main' to the name of your main class
jar {
    manifest {
        attributes 'Main-Class': 'Main'
    }
}

