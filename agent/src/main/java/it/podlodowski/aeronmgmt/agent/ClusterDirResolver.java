package it.podlodowski.aeronmgmt.agent;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ClusterDirResolver {

    private static final Logger LOGGER = LoggerFactory.getLogger(ClusterDirResolver.class);
    private static final Pattern TRAILING_ORDINAL = Pattern.compile("-(\\d+)$");

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
