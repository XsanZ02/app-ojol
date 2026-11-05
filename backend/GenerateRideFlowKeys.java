import java.nio.file.*;
import java.security.*;
import java.util.Base64;

public class GenerateRideFlowKeys {
    public static void main(String[] args) throws Exception {
        Path dir = Path.of(args[0]);
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair pair = generator.generateKeyPair();

        String privateKey = Base64.getMimeEncoder(64, new byte[]{'\n'})
            .encodeToString(pair.getPrivate().getEncoded());
        String publicKey = Base64.getMimeEncoder(64, new byte[]{'\n'})
            .encodeToString(pair.getPublic().getEncoded());

        Files.writeString(dir.resolve("private.pem"),
            "-----BEGIN PRIVATE KEY-----\n" + privateKey +
            "\n-----END PRIVATE KEY-----\n");
        Files.writeString(dir.resolve("public.pem"),
            "-----BEGIN PUBLIC KEY-----\n" + publicKey +
            "\n-----END PUBLIC KEY-----\n");

        System.out.println("RSA development keys created in " + dir);
    }
}
