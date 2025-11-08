10. Credential equality and comparison algorithm

Credential equality and comparison is the process to determine whether a verifiable credential is semantically equivalent to another one.

A Host SHOULD treat a credential as the same as another when both the issuer id and the AchievementCredential id are equal after unescaping of any percent encoded characters [RFC3986] followed by truncation of leading and trailing whitespace.

If the two credentials are equal according to the above, then the credential with the newer validFrom is the more up-to-date representation and could be interpreted as a replacement of the prior issued credential.
10.1 Examples
10.1.1 Equality

Credentials A and B are equal since they have the same id and the same issuer.id.
Example 30: Sample credential A

{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
"https://www.w3.org/2018/credentials/examples/v2"
],
"id": "http://example.edu/credentials/3732",
"type": ["VerifiableCredential", "OpenBadgeCredential"],
"issuer": {
"id": "https://example.edu/issuers/565049",
"type": ["Profile"],
"name": "Example University"
},
"validFrom": "2010-01-01T00:00:00Z",
"name": "Teamwork Badge",
"credentialSubject": {
"id": "did:example:ebfeb1f712ebc6f1c276e12ec21",
"type": ["AchievementSubject"],
"achievement": {
"id": "https://example.com/achievements/21st-century-skills/teamwork",
"type": [
"Achievement"
],
"criteria": {
"narrative": "Team members are nominated for this badge by their peers and recognized upon review by Example Corp management."
},
"description": "This badge recognizes the development of the capacity to collaborate within a group environment.",
"name": "Teamwork"
}
}
}

Example 31: Sample credential B

{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
"https://www.w3.org/2018/credentials/examples/v2"
],
"id": "http://example.edu/credentials/3732",
"type": ["VerifiableCredential", "OpenBadgeCredential"],
"issuer": {
"id": "https://example.edu/issuers/565049",
"type": ["Profile"],
"name": "Example University"
},
"validFrom": "2010-01-01T00:00:00Z",
"name": "Teamwork Badge",
"credentialSubject": {
"id": "did:example:ebfeb1f712ebc6f1c276e12ec21",
"type": ["AchievementSubject"],
"achievement": {
"id": "https://example.com/achievements/21st-century-skills/teamwork",
"type": [
"Achievement"
],
"criteria": {
"narrative": "Team members are nominated for this badge by their peers and recognized upon review by Example Corp management."
},
"description": "This badge recognizes the development of the capacity to collaborate within a group environment.",
"name": "Teamwork"
}
}
}

Since they also have the same validFrom both are up-to-date.
10.1.2 Comparison

Credentials C and D are equal since they have the same id and the same issuer.id.
Example 32: Sample credential C

{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
"https://www.w3.org/2018/credentials/examples/v2"
],
"id": "http://example.edu/credentials/3732",
"type": ["VerifiableCredential", "OpenBadgeCredential"],
"issuer": {
"id": "https://example.edu/issuers/565049",
"type": ["Profile"],
"name": "Example University"
},
"validFrom": "2010-03-01T00:00:00Z",
"name": "Teamwork Badge",
"credentialSubject": {
"id": "did:example:ebfeb1f712ebc6f1c276e12ec21",
"type": ["AchievementSubject"],
"achievement": {
"id": "https://example.com/achievements/21st-century-skills/teamwork",
"type": [
"Achievement"
],
"criteria": {
"narrative": "Team members are nominated for this badge by their peers and recognized upon review by Example Corp management."
},
"description": "This badge recognizes the development of the capacity to collaborate within a group environment.",
"name": "Teamwork"
}
}
}

Example 33: Sample credential D

{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
"https://www.w3.org/2018/credentials/examples/v2"
],
"id": "http://example.edu/credentials/3732",
"type": ["VerifiableCredential", "OpenBadgeCredential"],
"issuer": {
"id": "https://example.edu/issuers/565049",
"type": ["Profile"],
"name": "Example University"
},
"validFrom": "2010-01-01T00:00:00Z",
"name": "Teamwork Badge",
"credentialSubject": {
"id": "did:example:ebfeb1f712ebc6f1c276e12ec21",
"type": ["AchievementSubject"],
"achievement": {
"id": "https://example.com/achievements/21st-century-skills/teamwork",
"type": [
"Achievement"
],
"criteria": {
"narrative": "Team members are nominated for this badge by their peers and recognized upon review by Example Corp management."
},
"description": "This badge recognizes the development of the capacity to collaborate within a group environment.",
"name": "Teamwork"
}
}
}

The credential C is the up-to-date representation because it has a more recent validFrom (2010-03-01T00:00:00Z).
