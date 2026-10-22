package fr.autoroutes.supervision.aggregation;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/** Format binaire versionné et compressé ; aucune désérialisation Java générique (pas de surface d'attaque). */
public final class CheckpointCodec {

    private static final int VERSION = 2;
    private static final long NO_INSTANT = Long.MIN_VALUE;

    public byte[] encode(CheckpointData data) {
        var bytes = new ByteArrayOutputStream();
        try (var out = new DataOutputStream(new GZIPOutputStream(bytes))) {
            out.writeInt(VERSION);
            out.writeLong(data.createdAt().toEpochMilli());
            out.writeInt(data.nextOffsets().size());
            for (var e : data.nextOffsets().entrySet()) {
                out.writeInt(e.getKey());
                out.writeLong(e.getValue());
            }
            out.writeInt(data.watermarks().size());
            for (var e : data.watermarks().entrySet()) {
                out.writeInt(e.getKey());
                out.writeLong(e.getValue().toEpochMilli());
            }
            out.writeInt(data.stations().size());
            for (var station : data.stations()) {
                out.writeUTF(station.stationId());
                out.writeLong(station.lastEventTime() == null ? NO_INSTANT : station.lastEventTime().toEpochMilli());
                out.writeInt(station.minutes().size());
                for (var minute : station.minutes()) {
                    out.writeLong(minute[0]);
                    out.writeLong(minute[1]);
                    out.writeLong(minute[2]);
                }
            }
            out.writeInt(data.od().size());
            for (var flow : data.od()) {
                out.writeLong(flow.bucket());
                out.writeUTF(flow.originId());
                out.writeUTF(flow.destinationId());
                out.writeLong(flow.vehicles());
            }
            out.writeInt(data.odCoverage().size());
            for (var c : data.odCoverage()) {
                out.writeLong(c.bucket());
                for (var count : c.counts()) {
                    out.writeLong(count);
                }
            }
            out.writeInt(data.dedup().size());
            for (var e : data.dedup().entrySet()) {
                out.writeLong(e.getKey());
                out.writeInt(e.getValue().length);
                for (var id : e.getValue()) {
                    out.writeLong(id);
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return bytes.toByteArray();
    }

    public CheckpointData decode(byte[] payload) {
        try (var in = new DataInputStream(new GZIPInputStream(new ByteArrayInputStream(payload)))) {
            var version = in.readInt();
            // La version 1 ne contient pas la couverture O/D : elle redémarre à vide, les flux O/D restent intacts.
            if (version != VERSION && version != 1) {
                throw new IllegalArgumentException("Version de point de reprise non prise en charge : " + version);
            }
            var createdAt = Instant.ofEpochMilli(in.readLong());
            var offsets = new HashMap<Integer, Long>();
            for (int i = 0, n = in.readInt(); i < n; i++) {
                offsets.put(in.readInt(), in.readLong());
            }
            var watermarks = new HashMap<Integer, Instant>();
            for (int i = 0, n = in.readInt(); i < n; i++) {
                watermarks.put(in.readInt(), Instant.ofEpochMilli(in.readLong()));
            }
            var stations = new ArrayList<AggregationState.StationCheckpoint>();
            for (int i = 0, n = in.readInt(); i < n; i++) {
                var id = in.readUTF();
                var last = in.readLong();
                var minutes = new ArrayList<long[]>();
                for (int j = 0, m = in.readInt(); j < m; j++) {
                    minutes.add(new long[] {in.readLong(), in.readLong(), in.readLong()});
                }
                stations.add(new AggregationState.StationCheckpoint(id, last == NO_INSTANT ? null : Instant.ofEpochMilli(last), List.copyOf(minutes)));
            }
            var od = new ArrayList<OdCounters.OdCheckpoint>();
            for (int i = 0, n = in.readInt(); i < n; i++) {
                od.add(new OdCounters.OdCheckpoint(in.readLong(), in.readUTF(), in.readUTF(), in.readLong()));
            }
            var odCoverage = new ArrayList<OdCounters.CoverageCheckpoint>();
            if (version >= 2) {
                for (int i = 0, n = in.readInt(); i < n; i++) {
                    odCoverage.add(new OdCounters.CoverageCheckpoint(in.readLong(),
                            new long[] {in.readLong(), in.readLong(), in.readLong(), in.readLong()}));
                }
            }
            var dedup = new HashMap<Long, long[]>();
            for (int i = 0, n = in.readInt(); i < n; i++) {
                var minute = in.readLong();
                var ids = new long[in.readInt()];
                for (var j = 0; j < ids.length; j++) {
                    ids[j] = in.readLong();
                }
                dedup.put(minute, ids);
            }
            // Lecture jusqu'à la fin : c'est elle qui déclenche la vérification CRC du flux GZIP.
            if (in.read() != -1) {
                throw new IllegalArgumentException("Point de reprise : données en excès");
            }
            return new CheckpointData(createdAt, offsets, watermarks, stations, od, odCoverage, dedup);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
