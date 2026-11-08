package id.rideflow;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.KeyPairGenerator;
import java.util.Base64;
import java.util.Map;

public class JwtKeyTestResource implements QuarkusTestResourceLifecycleManager {

    private Path keyDirectory;

    @Override
    public Map<String, String> start() {
        try {
            keyDirectory = Files.createTempDirectory("rideflow-test-jwt-");
            var generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            var keyPair = generator.generateKeyPair();

            Path privateKey = writePem("private", "PRIVATE KEY", keyPair.getPrivate().getEncoded());
            return Map.of(
                    "smallrye.jwt.sign.key.location", privateKey.toUri().toString(),
                    "mp.jwt.verify.publickey", pem("PUBLIC KEY", keyPair.getPublic().getEncoded()));
        } catch (Exception exception) {
            deleteKeyDirectory();
            throw new IllegalStateException("Could not create temporary JWT test keys", exception);
        }
    }

    @Override
    public void stop() {
        deleteKeyDirectory();
    }

    private Path writePem(String name, String type, byte[] encodedKey) throws Exception {
        Path path = keyDirectory.resolve("rideflow-test-" + name + ".pem");
        return Files.writeString(path, pem(type, encodedKey), StandardOpenOption.CREATE_NEW);
    }

    private static String pem(String type, byte[] encodedKey) {
        return "-----BEGIN " + type + "-----\n"
                + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(encodedKey)
                + "\n-----END " + type + "-----\n";
    }

    private void deleteKeyDirectory() {
        if (keyDirectory == null) {
            return;
        }
        try (var paths = Files.walk(keyDirectory)) {
            for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Could not remove temporary JWT test keys", exception);
        } finally {
            keyDirectory = null;
        }
    }
}
