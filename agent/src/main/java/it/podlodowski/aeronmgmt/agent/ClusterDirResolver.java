package it.podlodowski.aeronmgmt.agent;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ClusterDirResolver {

    private static final Logger LOGGER = LoggerFactory.getLogger(ClusterDirResolver.class);
    private static final Pattern TRAILING_ORDINAL = Pattern.compile("-(\\d+)$");
    private static final String MARK_FILE_NAME = "cluster-mark.dat";
    private static final int MAX_SCAN_DEPTH = 3;

    /**
     * Resolves the cluster directory path.
     * 1. Expands {node_id} template if present.
     * 2. If resolved path contains cluster-mark.dat, returns it directly.
     * 3. Otherwise scans up to 3 levels deep for a single cluster-mark.dat.
     */
    static String resolve(String clusterDirTemplate, Function<String, String> env) {
        String path = expandTemplate(clusterDirTemplate, env);
        return findClusterDir(path);
    }

    private static String expandTemplate(String template, Function<String, String> env) {
        if (!template.contains("{node_id}")) {
            return template;
        }
        Integer nodeId = resolveNodeId(env);
        if (nodeId == null) {
            throw new IllegalStateException(
                    "CLUSTER_DIR contains {node_id} but no node ID could be resolved. " +
                    "Set NODE_ID, POD_NAME, or AERON_MANAGEMENT_AGENT_NODE_ID.");
        }
        return template.replace("{node_id}", String.valueOf(nodeId));
    }

    private static String findClusterDir(String path) {
        File dir = new File(path);
        // Direct path: mark file exists here
        if (new File(dir, MARK_FILE_NAME).exists()) {
            LOGGER.info("Cluster dir (direct): {}", path);
            return path;
        }

        // Scan for mark file
        LOGGER.info("No {} in {}, scanning up to {} levels deep...", MARK_FILE_NAME, path, MAX_SCAN_DEPTH);
        List<File> found = new ArrayList<>();
        scanForMarkFile(dir, 0, found);

        if (found.isEmpty()) {
            throw new IllegalStateException(
                    "No " + MARK_FILE_NAME + " found under " + path + " (scanned " + MAX_SCAN_DEPTH + " levels)");
        }
        if (found.size() > 1) {
            throw new IllegalStateException(
                    "Found multiple " + MARK_FILE_NAME + " under " + path + ": " + found +
                    ". Set AERON_MANAGEMENT_AGENT_CLUSTER_DIR to the exact path.");
        }

        String resolved = found.get(0).getParent();
        LOGGER.info("Cluster dir (scanned): {}", resolved);
        return resolved;
    }

    private static void scanForMarkFile(File dir, int depth, List<File> results) {
        if (depth > MAX_SCAN_DEPTH || !dir.isDirectory()) {
            return;
        }
        File markFile = new File(dir, MARK_FILE_NAME);
        if (markFile.exists()) {
            results.add(markFile);
            return; // don't scan deeper once found
        }
        File[] children = dir.listFiles();
        if (children != null) {
            for (File child : children) {
                if (child.isDirectory()) {
                    scanForMarkFile(child, depth + 1, results);
                }
            }
        }
    }

    static Integer resolveNodeId(Function<String, String> env) {
        // 1. Explicit agent override
        String agentNodeId = env.apply("AERON_MANAGEMENT_AGENT_NODE_ID");
        if (agentNodeId != null) {
            return Integer.parseInt(agentNodeId);
        }

        // 2. Cluster app's NODE_ID (shared pod env)
        String nodeId = env.apply("NODE_ID");
        if (nodeId != null) {
            return Integer.parseInt(nodeId);
        }

        // 3. POD_NAME trailing ordinal
        Integer fromPod = parseTrailingOrdinal(env.apply("POD_NAME"));
        if (fromPod != null) {
            return fromPod;
        }

        // 4. HOSTNAME trailing ordinal
        return parseTrailingOrdinal(env.apply("HOSTNAME"));
    }

    private static Integer parseTrailingOrdinal(String value) {
        if (value == null) {
            return null;
        }
        Matcher m = TRAILING_ORDINAL.matcher(value);
        return m.find() ? Integer.parseInt(m.group(1)) : null;
    }
}
