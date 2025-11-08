6. Open Badges API

Open Badges can be exchanged using the API (application programming interface) defined here, or as documents.

This specification defines a RESTful API protocol to be implemented by applications serving in the roles of Client and Resource Server. The API uses OAuth 2.0 for authentication and granular resource-based permission scopes. Please see the Open Badges Specification Conformance and Certification Guide v3.0 for a list of which endpoints must be implemented for certification.
Note: Non-individual access

The API defined here is intended for Clients and servers that give individual users control over access to their resources. While system-to-system bulk transfers using OAuth 2.0 Client-Credentials Grant are expected to occur, it is out of scope for this version of the specification to define. Future versions of this specification may add explicit support for OAuth 2.0 Client-Credentials Grant.

In addition to the documentation in this section, there are OpenAPI files for the Open Badges API in both JSON and YAML format:

    JSON OpenAPI File
    YAML OpenAPI File

6.1 Architecture
Diagram showing the major components of the Open Badges API
Figure 4 Diagram showing the major components of the Open Badges API

There are five key components to the API architecture.

User
This is the user that owns the resources (badges) that are on the resource server. Also called a Resource Owner.
Web Browser
This is the web browser the user interacts with.
Client
This is the web application that interacts with the resource server on behalf of the user. Also called Consumer in the IMS Global Security Framework v1.1.
Authorization Server
This is a server that implements the OAuth 2.0 endpoints on behalf of the resource server. In many systems, the authorization server and the resource server are combined.
Resource Server
This is the server that has the protected resources (badges). Also called Provider in the IMS Global Security Framework v1.1.

The role of each component during Registration, Obtaining Tokens, and Authenticating with Tokens are described below.
6.2 Secure REST Endpoints

These endpoints are used to exchange OpenBadgeCredentials and Profile information.

All secure endpoint requests MUST be made over secure TLS 1.2 or 1.3 protocol.

All of the Secure REST Endpoints are protected by OAuth 2.0 access tokens as described in § 7. Open Badges API Security.
6.2.1 Scopes

Each endpoint requires an access token with a specific Open Badges scope as shown below.
Operation Scope
getCredentials https://purl.imsglobal.org/spec/ob/v3p0/scope/credential.readonly - Permission to read OpenBadgeCredentials for the authenticated entity.
upsertCredential https://purl.imsglobal.org/spec/ob/v3p0/scope/credential.upsert - Permission to create or update OpenBadgeCredentials for the authenticated entity.
getProfile https://purl.imsglobal.org/spec/ob/v3p0/scope/profile.readonly - Permission to read the profile for the authenticated entity.
putProfile https://purl.imsglobal.org/spec/ob/v3p0/scope/profile.update - Permission to update the profile for the authenticated entity.
6.2.2 getCredentials

Get issued OpenBadgeCredentials from the resource server for the supplied parameters and access token.
6.2.2.1 Request

GET /ims/ob/v3p0/credentials?limit={limit}&offset={offset}&since={since}
Request header, path, and query parameters Parameter Parameter Type Description Required
limit
(query)
PositiveInteger The maximum number of OpenBadgeCredentials to return per page. Optional
offset
(query)
NonNegativeInteger The index of the first AchievementCredential to return. (zero indexed) Optional
since
(query)
DateTime Only include OpenBadgeCredentials issued after this timestamp. Optional
6.2.2.2 Responses
Allowed response codes and content types Status Code Content-Type Header Content Type Content Description Content Required
200 application/json GetOpenBadgeCredentialsResponse The set of OpenBadgeCredentials that meet the request parameters. Paging applies to the total number of OpenBadgeCredentials in the response. Required
400 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the server cannot or will not process the request due to something that is perceived to be a client error. Required
401 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the request has not been applied because it lacks valid authentication credentials for the target resource. Required
403 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the server understood the request but refuses to fulfill it. The exact reason SHOULD be explained in the response payload. Required
405 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the server does not allow the method. Required
500 application/json Imsx_StatusInfo As defined in [rfc9110]. Implementations SHOULD avoid using this error code - use only if there is catastrophic error and there is not a more appropriate code. Required
DEFAULT application/json Imsx_StatusInfo The request was invalid or cannot be served. The exact error SHOULD be explained in the response payload. Required
Example 6: Sample getCredentials Request

GET /ims/ob/v3p0/credentials=2&offset=0 HTTP/1.1
Host: example.edu
Authorization: Bearer 863DF0B10F5D432EB2933C2A37CD3135A7BB7B07A68F65D92
Accept: application/json

Example 7: Sample getCredentials Response (line breaks for clarity)

HTTP/1.1 200 OK
Content-Type: application/ld+json
X-Total-Count: 1
Link: <https://www.imsglobal.org/ims/ob/v3p0/credentials?limit=2&offset=1>; rel="next",
<https://www.imsglobal.org/ims/ob/v3p0/credentials?limit=2&offset=0>; rel="last",
<https://www.imsglobal.org/ims/ob/v3p0/credentials?limit=2&offset=0>; rel="first",
<https://www.imsglobal.org/ims/ob/v3p0/credentials?limit=2&offset=0>; rel="prev"

{
"compactJwsStrings": [
"header.payload.signature",
"header.payload.signature"
]
}

6.2.3 upsertCredential

Create or replace an AchievementCredential on the resource server, appending it to the list of credentials for the subject, or replacing an existing entry in that list. The resource server SHOULD use the credential equality and comparison algorithm to compare and determine initial equality. The response code makes clear whether the operation resulted in a replacement or an insertion.
6.2.3.1 Request

POST /ims/ob/v3p0/credentials
Allowed request content types Content-Type Header Content Type Content Description Content Required
application/json AchievementCredential If the AchievementCredential is not signed with the VC-JWT Proof Format, the request body MUST be a AchievementCredential and the Content-Type MUST be application/vc+ld+json or application/json. Required
text/plain CompactJws If the AchievementCredential is signed with the VC-JWT Proof Format, the request body MUST be a CompactJws string and the Content-Type MUST be text/plain. Required
6.2.3.2 Responses
Allowed response codes and content types Status Code Content-Type Header Content Type Content Description Content Required
200 application/json AchievementCredential The AchievementCredential was successfully replaced on the resource server. The response body MUST be the AchievementCredential in the request. If the AchievementCredential is not signed with the VC-JWT Proof Format, the response body MUST be a AchievementCredential and the Content-Type MUST be application/vc+ld+json or application/json. Required
200 text/plain CompactJws The AchievementCredential was successfully replaced on the resource server. The response body MUST be the AchievementCredential in the request. If the AchievementCredential is signed with the VC-JWT Proof Format, the response body MUST be a CompactJws string and the Content-Type MUST be text/plain. Required
201 application/json AchievementCredential The AchievementCredential was successfully created on the resource server. The response body MUST be the AchievementCredential in the request. If the AchievementCredential is not signed with the VC-JWT Proof Format, the response body MUST be a AchievementCredential and the Content-Type MUST be application/vc+ld+json or application/json. Required
201 text/plain CompactJws The AchievementCredential was successfully created on the resource server. The response body MUST be the AchievementCredential in the request. If the AchievementCredential is signed with the VC-JWT Proof Format, the response body MUST be a CompactJws string and the Content-Type MUST be text/plain. Required
304 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that there is no need for the server to transfer a representation of the target resource because the request indicates that the client, which made the request conditional, already has a valid representation. Required
400 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the server cannot or will not process the request due to something that is perceived to be a client error. Required
401 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the request has not been applied because it lacks valid authentication credentials for the target resource. Required
403 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the server understood the request but refuses to fulfill it. The exact reason SHOULD be explained in the response payload. Required
404 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the origin server did not find a current representation for the target resource or is not willing to disclose that one exists. Required
405 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the server does not allow the method. Required
500 application/json Imsx_StatusInfo As defined in [rfc9110]. Implementations SHOULD avoid using this error code - use only if there is catastrophic error and there is not a more appropriate code. Required
DEFAULT application/json Imsx_StatusInfo The request was invalid or cannot be served. The exact error SHOULD be explained in the response payload. Required
Example 8: Sample upsertCredential Request

POST /ims/ob/v3p0/credentials HTTP/1.1
Host: example.edu
Authorization: Bearer 863DF0B10F5D432EB2933C2A37CD3135A7BB7B07A68F65D92
Accept: text/plain
Content-Type: text/plain

header.payload.signature

Example 9: Sample upsertCredential Response

HTTP/1.1 200 OK
Content-Type: text/plain

header.payload.signature

6.2.4 getProfile

Fetch the profile from the resource server for the supplied access token. Profiles that are received MAY contain attributes that a Host SHOULD authenticate before using in practice.
6.2.4.1 Request

GET /ims/ob/v3p0/profile
6.2.4.2 Responses
Allowed response codes and content types Status Code Content-Type Header Content Type Content Description Content Required
200 application/json Profile The matching profile. Required
404 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the origin server did not find a current representation for the target resource or is not willing to disclose that one exists. Required
400 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the server cannot or will not process the request due to something that is perceived to be a client error. Required
401 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the request has not been applied because it lacks valid authentication credentials for the target resource. Required
403 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the server understood the request but refuses to fulfill it. The exact reason SHOULD be explained in the response payload. Required
405 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the server does not allow the method. Required
500 application/json Imsx_StatusInfo As defined in [rfc9110]. Implementations SHOULD avoid using this error code - use only if there is catastrophic error and there is not a more appropriate code. Required
DEFAULT application/json Imsx_StatusInfo The request was invalid or cannot be served. The exact error SHOULD be explained in the response payload. Required
Example 10: Sample getProfile Request

GET /ims/ob/v3p0/profile HTTP/1.1
Host: example.edu
Authorization: Bearer 863DF0B10F5D432EB2933C2A37CD3135A7BB7B07A68F65D92
Accept: application/json

Example 11: Sample getProfile Response

HTTP/1.1 200 OK
Content-Type: application/json

{
"@context": [
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
],
"type": "Profile",
"id": "https://example.edu/issuers/565049",
"name": "Example University"
}

6.2.5 putProfile

Update the profile for the authenticate entity.
6.2.5.1 Request

PUT /ims/ob/v3p0/profile
Allowed request content types Content-Type Header Content Type Content Description Content Required
application/json Profile The request MUST include the entire Profile object. The resource server MAY respond with 400 BAD_REQUEST to reject data that is known immediately to not be acceptable by the platform, e.g. to reject a "telephone" property if the resource server cannot validate telephone numbers. Required
6.2.5.2 Responses
Allowed response codes and content types Status Code Content-Type Header Content Type Content Description Content Required
200 application/json Profile The matching profile. Successful request responses will be the same as GET Profile and may not include the patched values (as the resource server may be waiting for asynchronous processes to complete before accepting the value). The values may never become part of the published profile. Required
202 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the request has been accepted for processing, but the processing has not been completed. Required
304 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that there is no need for the server to transfer a representation of the target resource because the request indicates that the client, which made the request conditional, already has a valid representation. Required
400 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the server cannot or will not process the request due to something that is perceived to be a client error. Required
401 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the request has not been applied because it lacks valid authentication credentials for the target resource. Required
403 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the server understood the request but refuses to fulfill it. The exact reason SHOULD be explained in the response payload. Required
404 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the origin server did not find a current representation for the target resource or is not willing to disclose that one exists. Required
405 application/json Imsx_StatusInfo As defined in [rfc9110], indicating that the server does not allow the method. Required
500 application/json Imsx_StatusInfo As defined in [rfc9110]. Implementations SHOULD avoid using this error code - use only if there is catastrophic error and there is not a more appropriate code. Required
DEFAULT application/json Imsx_StatusInfo The request was invalid or cannot be served. The exact error SHOULD be explained in the response payload. Required
Example 12: Sample putProfile Request

PUT /ims/ob/v3p0/profile HTTP/1.1
Host: example.edu
Authorization: Bearer 863DF0B10F5D432EB2933C2A37CD3135A7BB7B07A68F65D92
Accept: application/json
Content-Type: application/json

{
"@context": [
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
],
"type": "Profile",
"id": "https://example.edu/issuers/565049",
"name": "Example University",
"phone": "111-222-3333"
}

Example 13: Sample putProfile Response

{
"@context": [
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
],
"type": "Profile",
"id": "https://example.edu/issuers/565049",
"name": "Example University",
"phone": "111-222-3333"
}

6.3 Service Discovery Endpoint

Access to the discovery endpoint MUST NOT be protected. The Service Description Document (SDD) MUST be provided over HTTPS with TLS 1.2 or 1.3.
6.3.1 getServiceDescription

Fetch the Service Description Document from the resource server.
6.3.1.1 Request

GET /ims/ob/v3p0/discovery
6.3.1.2 Responses
Allowed response codes and content types Status Code Content-Type Header Content Type Content Description Content Required
200 application/json ServiceDescriptionDocument The service discovery document. Required
DEFAULT application/json Imsx_StatusInfo The request was invalid or cannot be served. The exact error SHOULD be explained in the response payload. Required
Example 14: Sample getServiceDescription request

GET /ims/ob/v3p0/discovery HTTP/1.1
Host: example.edu
Accept: application/json

Example 15: Sample getServiceDescription response

HTTP/1.1 200 OK
Content-Type: application/json

...
"components": {
"securitySchemes": {
"OAuth2ACG": {
"type": "oauth2",
"description": "OAuth 2.0 Authorization Code Grant authorization",
"x-imssf-name": "Example Provider",
"x-imssf-privacyPolicyUrl": "provider.example.com/privacy",
"x-imssf-registrationUrl": "provider.example.com/registration",
"x-imssf-termsOfServiceUrl": "provider.example.com/terms",
"flows": {
"authorizationCode": {
"tokenUrl": "provider.example.com/token",
"authorizationUrl": "provider.example.com/authorize",
"refreshUrl": "provider.example.com/token",
"scopes": {
"https://purl.imsglobal.org/spec/ob/v3p0/scope/credential.readonly" : "...",
"https://purl.imsglobal.org/spec/ob/v3p0/scope/credential.upsert" : "...",
"https://purl.imsglobal.org/spec/ob/v3p0/scope/profile.readonly" : "...",
"https://purl.imsglobal.org/spec/ob/v3p0/scope/profile.update" : "..."
}
}
}
}
},
"schemas": {
...
}
}
...

6.4 Paging

Pagination of getCredentials results is controlled by two query string parameters appended to the request. The response includes the following pagination headers.
Response Header Description Required
X-Total-Count: <total_count> The resource server MUST include an X-Total-Count response header if the total result count is known. If the total result count is not known, the total count header MUST be ommitted. Conditionally Required for 200 OK Response
Link: <pagination_links> The resource server MUST include a Link response header if the list of credentials in the response is incomplete; and MAY include the Link header if the response is complete. Conditionally Required for 200 OK Response

If present, the Link header MUST support all of the following link relations (rel values):
Relation Description
next The link relation for the immediate next page of results. This MUST appear when the current list response is incomplete.
last The link relation for the last page of results. This MUST always appear.
first The link relation for the first page of results. This MUST always appear.
prev The link relation for the immediate previous page of results. This MUST appear when the offset is greater than zero.
6.5 Retry Behavior

Resource Servers MAY implement a Retry-After header to indicate a period of time to wait before attempting the request again.

If no Retry-After header is present and the response is non-2XX, it is recommended to retry the request in 30 minutes for an additional two attempts. After which, it MAY be desirable to alert the user that there is an issue with the connection (e.g. perhaps they need to reauthenticate or manually trigger the request when they believe services are back up).
