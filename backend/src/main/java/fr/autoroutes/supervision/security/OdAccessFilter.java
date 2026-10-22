package fr.autoroutes.supervision.security;

import fr.autoroutes.supervision.SupervisionProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Journal d'audit et budget de requêtes sur les flux O/D et l'administration.
 * Le seuil de 3 véhicules protège chaque réponse, pas leur recoupement : en interrogeant beaucoup de fenêtres ou de filtres,
 * on peut retrouver un flux masqué par différence. Le budget par utilisateur freine cette énumération, le journal la rend
 * détectable. Le journal ne contient ni plaque ni identifiant de véhicule : l'utilisateur, la route et les filtres.
 */
@Component
class OdAccessFilter extends OncePerRequestFilter {

    private static final Logger AUDIT = LoggerFactory.getLogger("AUDIT");
    private static final long WINDOW_MS = 60_000;
    private static final int MAX_TRACKED = 10_000;

    private record Window(long start, int count) {
    }

    private final int budget;
    private final Clock clock;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    OdAccessFilter(SupervisionProperties properties, Clock clock) {
        this.budget = properties.security().odQueriesPerMinute();
        this.clock = clock;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !isOd(request) && !isAdmin(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var user = request.getUserPrincipal() == null ? request.getRemoteAddr() : request.getUserPrincipal().getName();
        if (isOd(request) && !tryAcquire(user)) {
            AUDIT.warn("user={} {} {} budget O/D dépassé", user, request.getMethod(), request.getRequestURI());
            response.setHeader("Retry-After", "60");
            response.sendError(429, "Budget de requêtes O/D dépassé");
            return;
        }
        try {
            chain.doFilter(request, response);
        } finally {
            AUDIT.info("user={} {} {}{} -> {}", user, request.getMethod(), request.getRequestURI(),
                    request.getQueryString() == null ? "" : "?" + request.getQueryString(), response.getStatus());
        }
    }

    private boolean tryAcquire(String user) {
        var now = clock.millis();
        if (windows.size() > MAX_TRACKED) {
            windows.values().removeIf(w -> now - w.start() >= WINDOW_MS);
        }
        var window = windows.compute(user, (key, current) -> current == null || now - current.start() >= WINDOW_MS
                ? new Window(now, 1) : new Window(current.start(), current.count() + 1));
        return window.count() <= budget;
    }

    private static boolean isOd(HttpServletRequest request) {
        var path = request.getRequestURI();
        return path.equals("/api/v1/od") || path.startsWith("/api/v1/od/") || path.equals("/api/v1/history/od");
    }

    private static boolean isAdmin(HttpServletRequest request) {
        return request.getRequestURI().startsWith("/api/v1/admin/");
    }
}
