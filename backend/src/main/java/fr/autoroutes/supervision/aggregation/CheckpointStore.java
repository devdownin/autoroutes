package fr.autoroutes.supervision.aggregation;

import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
class CheckpointStore {

    private static final int RETAINED = 3;

    private final JdbcClient jdbc;

    CheckpointStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    void save(String epoch, byte[] payload) {
        jdbc.sql("insert into checkpoint (epoch, size_bytes, payload) values (:epoch, :size, :payload)")
                .param("epoch", epoch)
                .param("size", payload.length)
                .param("payload", payload)
                .update();
        jdbc.sql("delete from checkpoint where id not in (select id from checkpoint order by id desc limit :retained)")
                .param("retained", RETAINED)
                .update();
    }

    Optional<byte[]> latest() {
        return jdbc.sql("select payload from checkpoint order by id desc limit 1").query(byte[].class).optional();
    }
}
