package fr.autoroutes.supervision.assignment;

/** Port vers la diffusion : l'affectation ne dépend pas du transport (SSE). */
public interface SegmentPublisher {

    void publishSegments(SegmentLoads loads);
}
