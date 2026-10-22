package fr.autoroutes.supervision.diffusion;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

/** Enveloppe commune des messages SSE (protocole phase 2, section 8.2). {@code seq} seulement sur snapshot et delta. */
@JsonInclude(JsonInclude.Include.NON_NULL)
record StreamMessage(String type, String epoch, Long seq, Instant sentAt, Instant watermark, Object payload) {
}
