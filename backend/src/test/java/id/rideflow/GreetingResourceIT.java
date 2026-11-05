package id.rideflow;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusIntegrationTest;

@QuarkusIntegrationTest
@QuarkusTestResource(JwtKeyTestResource.class)
class GreetingResourceIT extends GreetingResourceTest {
    // Execute the same tests but in packaged mode.
}
