package fr.autoroutes.supervision.diffusion;

import java.io.IOException;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.function.Consumer;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Un navigateur connecté : file bornée vidée par un thread virtuel dédié.
 * File saturée (client lent, onglet en arrière-plan) : la file est vidée, un message « resync » est envoyé
 * puis la connexion fermée ; le client se reconnecte et reçoit un snapshot.
 */
final class ClientChannel {

    private final SseEmitter emitter;
    private final BlockingQueue<StreamFrame> queue;
    private final StreamFrame resyncFrame;
    private final Consumer<ClientChannel> onClose;
    private volatile boolean closing;
    private volatile boolean closed;

    ClientChannel(SseEmitter emitter, int capacity, StreamFrame resyncFrame, Consumer<ClientChannel> onClose) {
        this.emitter = emitter;
        this.queue = new ArrayBlockingQueue<>(capacity);
        this.resyncFrame = resyncFrame;
        this.onClose = onClose;
        emitter.onCompletion(this::close);
        emitter.onTimeout(this::close);
        emitter.onError(error -> close());
    }

    void start() {
        Thread.ofVirtual().name("sse-client").start(this::drain);
    }

    /** @return faux si le client a été déclaré saturé */
    boolean offer(StreamFrame frame) {
        if (closing || closed) {
            return false;
        }
        if (queue.offer(frame)) {
            return true;
        }
        closing = true;
        queue.clear();
        queue.offer(resyncFrame);
        return false;
    }

    boolean isOpen() {
        return !closing && !closed;
    }

    private void drain() {
        try {
            while (!closed) {
                var frame = queue.take();
                var event = SseEmitter.event().name(frame.event()).data(frame.data(), MediaType.APPLICATION_JSON);
                if (frame.id() != null) {
                    event.id(frame.id());
                }
                emitter.send(event);
                if (frame == resyncFrame) {
                    emitter.complete();
                    close();
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            close();
        } catch (IOException | IllegalStateException e) {
            close();
        }
    }

    private void close() {
        if (!closed) {
            closed = true;
            onClose.accept(this);
        }
    }
}
