package it.podlodowski.aeronmgmt.server.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * Forwards all non-API, non-static-resource paths to index.html
 * so the React router can handle client-side routing (e.g. /clusters/default/nodes/1).
 */
@Controller
public class SpaForwardingController {

    @RequestMapping(value = {"/clusters/**"})
    public String forward() {
        return "forward:/index.html";
    }
}
