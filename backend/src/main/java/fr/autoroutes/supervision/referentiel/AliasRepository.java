package fr.autoroutes.supervision.referentiel;

import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class AliasRepository {

    record StoredAliases(String version, String content) {
    }

    private final JdbcClient jdbc;

    AliasRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<StoredAliases> latest() {
        return jdbc.sql("select version, content from alias_version order by imported_at desc limit 1")
                .query(StoredAliases.class)
                .optional();
    }

    void save(String version, String content) {
        jdbc.sql("insert into alias_version (version, content) values (:version, :content)")
                .param("version", version)
                .param("content", content)
                .update();
    }
}
