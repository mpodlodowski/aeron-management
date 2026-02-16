# Stage 1: Compile
FROM eclipse-temurin:17-jdk-jammy AS build
WORKDIR /build
ADD https://repo1.maven.org/maven2/io/aeron/aeron-all/1.46.5/aeron-all-1.46.5.jar lib/aeron-all.jar
COPY ClusterNode.java src/
RUN javac -cp lib/aeron-all.jar -d classes src/ClusterNode.java

# Stage 2: Runtime
FROM eclipse-temurin:17-jre-jammy
RUN groupadd -g 996 aeron && useradd -u 996 -g 996 -m aeron \
    && mkdir -p /home/aeron/aeron-cluster && chown -R aeron:aeron /home/aeron
COPY --from=build /build/lib/aeron-all.jar /app/lib/aeron-all.jar
COPY --from=build /build/classes/ /app/classes/
USER 996
ENTRYPOINT ["java", \
    "--add-opens=java.base/sun.nio.ch=ALL-UNNAMED", \
    "-cp", "/app/classes:/app/lib/aeron-all.jar", \
    "ClusterNode"]
