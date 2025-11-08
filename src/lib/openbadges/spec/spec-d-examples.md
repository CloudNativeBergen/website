D. Examples
D.1 Basic OpenBadgeCredential
Note
The following Credential is a minimal achievement assertion. The Achievement definition here is assumed
Example 35: Sample OpenBadgeCredential

    Credential
    Verifiable Credential (with proof)
    Verifiable Credential (as JWT)

---------------- JWT header ---------------
{
"alg": "RS256",
"typ": "JWT",
"jwk": {
"e": "AQAB",
"kty": "RSA",
"n": "qEcLXkjczYJf4wn-2UGkECgEOXaujnd_0ASR7_lqO7UAfPaO9SYMB5BFziualQLpEsIff3
ALnl7QrDxNu9LCSdhqP0MsrjNg0yaAgRHMStBu78Te9qLV8ohUfYbGIkET1Rhk6BsjmBquVI97tbYNsH
Y9e6oZgwv5PBq7pSn7x0bVJ4Z7owe4SiLlA86EGjtm1WnEGnbX9lPjCRsB_IQqG3Zi-6pZ678c75EwvV
kXuZivh5GgKFLeLRSKpGEdkuNXjnvX51BZvLeAPEUjf6MbtXPjMNUn7-XkxYPCPlMS66wHVlgZ6nwXj8
3q2JJuJ8Yqo0-ieUDqQr_YIiz86WcgzQ"
}
}
--------------- JWT payload ---------------
// NOTE: The example below uses a valid VC-JWT serialization
// that duplicates the iss, nbf, jti, and sub fields in the
// Verifiable Credential (vc) field.
{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
],
"id": "http://example.com/credentials/3527",
"type": [
"VerifiableCredential",
"OpenBadgeCredential"
],
"issuer": {
"id": "https://example.com/issuers/876543",
"type": [
"Profile"
],
"name": "Example Corp"
},
"validFrom": "2010-01-01T00:00:00Z",
"name": "Teamwork Badge",
"credentialSubject": {
"id": "did:example:ebfeb1f712ebc6f1c276e12ec21",
"type": [
"AchievementSubject"
],
"achievement": {
"id": "https://example.com/achievements/21st-century-skills/teamwork",
"type": [
"Achievement"
],
"criteria": {
"narrative": "Team members are nominated for this badge by their peers a
nd recognized upon review by Example Corp management."
},
"description": "This badge recognizes the development of the capacity to c
ollaborate within a group environment.",
"name": "Teamwork"
}
},
"iss": "https://example.com/issuers/876543",
"jti": "http://example.com/credentials/3527",
"sub": "did:example:ebfeb1f712ebc6f1c276e12ec21"
}
--------------- JWT ---------------
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImp3ayI6eyJlIjoiQVFBQiIsImt0eSI6IlJTQSIsIm4i
OiJxRWNMWGtqY3pZSmY0d24tMlVHa0VDZ0VPWGF1am5kXzBBU1I3X2xxTzdVQWZQYU85U1lNQjVCRnpp
dWFsUUxwRXNJZmYzQUxubDdRckR4TnU5TENTZGhxUDBNc3JqTmcweWFBZ1JITVN0QnU3OFRlOXFMVjhv
aFVmWWJHSWtFVDFSaGs2QnNqbUJxdVZJOTd0YllOc0hZOWU2b1pnd3Y1UEJxN3BTbjd4MGJWSjRaN293
ZTRTaUxsQTg2RUdqdG0xV25FR25iWDlsUGpDUnNCX0lRcUczWmktNnBaNjc4Yzc1RXd2VmtYdVppdmg1
R2dLRkxlTFJTS3BHRWRrdU5Yam52WDUxQlp2TGVBUEVVamY2TWJ0WFBqTU5VbjctWGt4WVBDUGxNUzY2
d0hWbGdaNm53WGo4M3EySkp1SjhZcW8wLWllVURxUXJfWUlpejg2V2NnelEifX0.eyJAY29udGV4dCI6
WyJodHRwczovL3d3dy53My5vcmcvbnMvY3JlZGVudGlhbHMvdjIiLCJodHRwczovL3B1cmwuaW1zZ2xv
YmFsLm9yZy9zcGVjL29iL3YzcDAvY29udGV4dC0zLjAuMy5qc29uIl0sImlkIjoiaHR0cDovL2V4YW1w
bGUuY29tL2NyZWRlbnRpYWxzLzM1MjciLCJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiT3Bl
bkJhZGdlQ3JlZGVudGlhbCJdLCJpc3N1ZXIiOnsiaWQiOiJodHRwczovL2V4YW1wbGUuY29tL2lzc3Vl
cnMvODc2NTQzIiwidHlwZSI6WyJQcm9maWxlIl0sIm5hbWUiOiJFeGFtcGxlIENvcnAifSwidmFsaWRG
cm9tIjoiMjAxMC0wMS0wMVQwMDowMDowMFoiLCJuYW1lIjoiVGVhbXdvcmsgQmFkZ2UiLCJjcmVkZW50
aWFsU3ViamVjdCI6eyJpZCI6ImRpZDpleGFtcGxlOmViZmViMWY3MTJlYmM2ZjFjMjc2ZTEyZWMyMSIs
InR5cGUiOlsiQWNoaWV2ZW1lbnRTdWJqZWN0Il0sImFjaGlldmVtZW50Ijp7ImlkIjoiaHR0cHM6Ly9l
eGFtcGxlLmNvbS9hY2hpZXZlbWVudHMvMjFzdC1jZW50dXJ5LXNraWxscy90ZWFtd29yayIsInR5cGUi
OlsiQWNoaWV2ZW1lbnQiXSwiY3JpdGVyaWEiOnsibmFycmF0aXZlIjoiVGVhbSBtZW1iZXJzIGFyZSBu
b21pbmF0ZWQgZm9yIHRoaXMgYmFkZ2UgYnkgdGhlaXIgcGVlcnMgYW5kIHJlY29nbml6ZWQgdXBvbiBy
ZXZpZXcgYnkgRXhhbXBsZSBDb3JwIG1hbmFnZW1lbnQuIn0sImRlc2NyaXB0aW9uIjoiVGhpcyBiYWRn
ZSByZWNvZ25pemVzIHRoZSBkZXZlbG9wbWVudCBvZiB0aGUgY2FwYWNpdHkgdG8gY29sbGFib3JhdGUg
d2l0aGluIGEgZ3JvdXAgZW52aXJvbm1lbnQuIiwibmFtZSI6IlRlYW13b3JrIn19LCJpc3MiOiJodHRw
czovL2V4YW1wbGUuY29tL2lzc3VlcnMvODc2NTQzIiwianRpIjoiaHR0cDovL2V4YW1wbGUuY29tL2Ny
ZWRlbnRpYWxzLzM1MjciLCJzdWIiOiJkaWQ6ZXhhbXBsZTplYmZlYjFmNzEyZWJjNmYxYzI3NmUxMmVj
MjEifQ.cj2W3EM-RUFYdoiQf4GKRoa1_i8eD4ycAySBR5YhOf7D6kSxTfpbbPzilV5QgoVgZE9bKDObL
wi_c9QSK6ftHEN0FGVTwmH9Bo_6pod5e7zydN5pYo9pjzg1y3d6-n2kmpmVUaB7YeIt40tFVz_vBJpL0
lXxI7-MObTovYjX4i2PWIotbNtTrl-bRjK4AceP-tdcvbHHw5yv5tycr7nK-0tOproZme3DG6W-k992j
8vOY2AYWyY9PgflyDhb-b_sEgmkOrlDa2cmlzDW04-hFWzP2u_Rz-Y3wLbBs0nwTW9DrWOr48XfsKOZ2
0V9Z7stnMQiUFp4ZRf-l4v0yt1xGg

D.2 Complete OpenBadgeCredential

In this example, all required and optional properties are populated.
Note: Endorsements
The endorsements were signed by different issuers and provided to the issuer of this OpenBadgeCredential.
Example 36: Complete OpenBadgeCredential

    Credential
    Verifiable Credential (with proof)
    Verifiable Credential (as JWT)

---------------- JWT header ---------------
{
"alg": "RS256",
"typ": "JWT",
"jwk": {
"e": "AQAB",
"kty": "RSA",
"n": "qhZvITTUKh0NPJzSK2W-4QsD9vzoxx0GqAM-TFL6X-7WHnLaFFU7N5uo1vsIN8hKMSqKWr
yDnjxmmna2Wq7EL9Zc5VoiH5aSt51bEA6pC5cJnXbyN_wKcsL48xsleueoMOpkJBvCsvy5uv33-u2kh4
OMFbouXILJsckAI378Y2UIzau1hU6kNsWL-YYgBjlI7iZdlJQQWhlg2UoSlSUO7ZLIft5NV5TyT0pbc7
Saa-BQfUP1t6Up5MkW8TwWzB4qJCECkOtGPBx6I_NpRS9aOSb9I8pzW4G3kzP_nJTv8_L5x3HFIDoFz3
exhDtpZt60vsH4IDJejfKxjaAe1eAxOw"
}
}
--------------- JWT payload ---------------
// NOTE: The example below uses a valid VC-JWT serialization
// that duplicates the iss, nbf, jti, and sub fields in the
// Verifiable Credential (vc) field.
{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
"https://purl.imsglobal.org/spec/ob/v3p0/extensions.json"
],
"id": "http://1edtech.edu/credentials/3732",
"type": [
"VerifiableCredential",
"OpenBadgeCredential"
],
"name": "1EdTech University Degree for Example Student",
"description": "1EdTech University Degree Description",
"image": {
"id": "https://1edtech.edu/credentials/3732/image",
"type": "Image",
"caption": "1EdTech University Degree for Example Student"
},
"credentialSubject": {
"id": "did:example:ebfeb1f712ebc6f1c276e12ec21",
"type": [
"AchievementSubject"
],
"activityEndDate": "2010-01-02T00:00:00Z",
"activityStartDate": "2010-01-01T00:00:00Z",
"creditsEarned": 42,
"licenseNumber": "A-9320041",
"role": "Major Domo",
"source": {
"id": "https://school.edu/issuers/201234",
"type": [
"Profile"
],
"name": "1EdTech College of Arts"
},
"term": "Fall",
"identifier": [
{
"type": "IdentityObject",
"identityHash": "student@1edtech.edu",
"identityType": "emailAddress",
"hashed": false,
"salt": "not-used"
},
{
"type": "IdentityObject",
"identityHash": "somebody@gmail.com",
"identityType": "emailAddress",
"hashed": false,
"salt": "not-used"
}
],
"achievement": {
"id": "https://1edtech.edu/achievements/degree",
"type": [
"Achievement"
],
"alignment": [
{
"type": [
"Alignment"
],
"targetCode": "degree",
"targetDescription": "1EdTech University Degree programs.",
"targetName": "1EdTech University Degree",
"targetFramework": "1EdTech University Program and Course Catalog",
"targetType": "CFItem",
"targetUrl": "https://1edtech.edu/catalog/degree"
},
{
"type": [
"Alignment"
],
"targetCode": "degree",
"targetDescription": "1EdTech University Degree programs.",
"targetName": "1EdTech University Degree",
"targetFramework": "1EdTech University Program and Course Catalog",
"targetType": "CTDL",
"targetUrl": "https://credentialengineregistry.org/resources/ce-98cb02
7b-95ef-4494-908d-6f7790ec6b6b"
}
],
"achievementType": "Degree",
"creator": {
"id": "https://1edtech.edu/issuers/565049",
"type": [
"Profile"
],
"name": "1EdTech University",
"url": "https://1edtech.edu",
"phone": "1-222-333-4444",
"description": "1EdTech University provides online degree programs.",
"endorsement": [
{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
],
"id": "http://1edtech.edu/endorsementcredential/3732",
"type": [
"VerifiableCredential",
"EndorsementCredential"
],
"name": "SDE endorsement",
"issuer": {
"id": "https://accrediter.edu/issuers/565049",
"type": [
"Profile"
],
"name": "Example Accrediting Agency"
},
"validFrom": "2010-01-01T00:00:00Z",
"validUntil": "2020-01-01T00:00:00Z",
"credentialSubject": {
"id": "https://1edtech.edu/issuers/565049",
"type": [
"EndorsementSubject"
],
"endorsementComment": "1EdTech University is in good standing"
},
"credentialSchema": [
{
"id": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3
p0_endorsementcredential_schema.json",
"type": "1EdTechJsonSchemaValidator2019"
},
{
"id": "https://accrediter.edu/schema/endorsementcredential.json"
,
"type": "1EdTechJsonSchemaValidator2019"
}
],
"credentialStatus": {
"id": "https://1edtech.edu/credentials/3732/revocations",
"type": "1EdTechRevocationList"
},
"refreshService": {
"id": "http://1edtech.edu/credentials/3732",
"type": "1EdTechCredentialRefresh"
},
"proof": [
{
"type": "DataIntegrityProof",
"cryptosuite": "eddsa-rdf-2022",
"created": "2022-05-26T18:17:08Z",
"verificationMethod": "https://accrediter.edu/issuers/565049#zvP
kQiUFfJrgnCRhyPkTSkgrGXbnLR15pHH5HZVYNdM4TCAwQHqG7fMeMPLtYNRnEgoV1aJdR5E61eWu5sW
RYgtA",
"proofPurpose": "assertionMethod",
"proofValue": "zvPkQiUFfJrgnCRhyPkTSkgrGXbnLR15pHH5HZVYNdM4TCAwQ
HqG7fMeMPLtYNRnEgoV1aJdR5E61eWu5sWRYgtA"
}
]
},
{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
],
"id": "http://1edtech.edu/endorsementcredential/3733",
"type": [
"VerifiableCredential",
"EndorsementCredential"
],
"name": "SDE endorsement",
"issuer": {
"id": "https://state.gov/issuers/565049",
"type": [
"Profile"
],
"name": "State Department of Education"
},
"validFrom": "2010-01-01T00:00:00Z",
"validUntil": "2020-01-01T00:00:00Z",
"credentialSubject": {
"id": "https://1edtech.edu/issuers/565049",
"type": [
"EndorsementSubject"
],
"endorsementComment": "1EdTech University is in good standing"
},
"credentialSchema": [
{
"id": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3
p0_endorsementcredential_schema.json",
"type": "1EdTechJsonSchemaValidator2019"
},
{
"id": "https://state.gov/schema/endorsementcredential.json",
"type": "1EdTechJsonSchemaValidator2019"
}
],
"credentialStatus": {
"id": "https://state.gov/credentials/3732/revocations",
"type": "1EdTechRevocationList"
},
"refreshService": {
"id": "http://state.gov/credentials/3732",
"type": "1EdTechCredentialRefresh"
},
"proof": [
{
"type": "DataIntegrityProof",
"cryptosuite": "eddsa-rdf-2022",
"created": "2022-05-26T18:25:59Z",
"verificationMethod": "https://accrediter.edu/issuers/565049#z5b
DnmSgDczXwZGya6ZjxKaxkdKxzsCMiVSsgEVWxnaWK7ZqbKnzcCd7mUKE9DQaAL2QMXP5AquPeW6W2CW
rZ7jNC",
"proofPurpose": "assertionMethod",
"proofValue": "z5bDnmSgDczXwZGya6ZjxKaxkdKxzsCMiVSsgEVWxnaWK7Zqb
KnzcCd7mUKE9DQaAL2QMXP5AquPeW6W2CWrZ7jNC"
}
]
}
],
"image": {
"id": "https://1edtech.edu/logo.png",
"type": "Image",
"caption": "1EdTech University logo"
},
"email": "registrar@1edtech.edu",
"address": {
"type": [
"Address"
],
"addressCountry": "USA",
"addressCountryCode": "US",
"addressRegion": "TX",
"addressLocality": "Austin",
"streetAddress": "123 First St",
"postOfficeBoxNumber": "1",
"postalCode": "12345",
"geo": {
"type": "GeoCoordinates",
"latitude": 1,
"longitude": 1
}
},
"otherIdentifier": [
{
"type": "IdentifierEntry",
"identifier": "12345",
"identifierType": "sourcedId"
},
{
"type": "IdentifierEntry",
"identifier": "67890",
"identifierType": "nationalIdentityNumber"
}
],
"official": "Horace Mann",
"parentOrg": {
"id": "did:example:123456789",
"type": [
"Profile"
],
"name": "Universal Universities"
}
},
"creditsAvailable": 36,
"criteria": {
"id": "https://1edtech.edu/achievements/degree",
"narrative": "# Degree Requirements\nStudents must complete..."
},
"description": "1EdTech University Degree Description",
"endorsement": [
{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
],
"id": "http://1edtech.edu/endorsementcredential/3734",
"type": [
"VerifiableCredential",
"EndorsementCredential"
],
"name": "EAA endorsement",
"issuer": {
"id": "https://accrediter.edu/issuers/565049",
"type": [
"Profile"
],
"name": "Example Accrediting Agency"
},
"validFrom": "2010-01-01T00:00:00Z",
"validUntil": "2020-01-01T00:00:00Z",
"credentialSubject": {
"id": "https://1edtech.edu/issuers/565049",
"type": [
"EndorsementSubject"
],
"endorsementComment": "1EdTech University is in good standing"
},
"credentialSchema": [
{
"id": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0
_endorsementcredential_schema.json",
"type": "1EdTechJsonSchemaValidator2019"
},
{
"id": "https://accrediter.edu/schema/endorsementcredential.json",
"type": "1EdTechJsonSchemaValidator2019"
}
],
"credentialStatus": {
"id": "https://1edtech.edu/credentials/3732/revocations",
"type": "1EdTechRevocationList"
},
"refreshService": {
"id": "http://1edtech.edu/credentials/3732",
"type": "1EdTechCredentialRefresh"
},
"proof": [
{
"type": "DataIntegrityProof",
"cryptosuite": "eddsa-rdf-2022",
"created": "2022-05-26T18:17:08Z",
"verificationMethod": "https://accrediter.edu/issuers/565049#zvPkQ
iUFfJrgnCRhyPkTSkgrGXbnLR15pHH5HZVYNdM4TCAwQHqG7fMeMPLtYNRnEgoV1aJdR5E61eWu5sWRY
gtA",
"proofPurpose": "assertionMethod",
"proofValue": "zvPkQiUFfJrgnCRhyPkTSkgrGXbnLR15pHH5HZVYNdM4TCAwQHq
G7fMeMPLtYNRnEgoV1aJdR5E61eWu5sWRYgtA"
}
]
}
],
"fieldOfStudy": "Research",
"humanCode": "R1",
"image": {
"id": "https://1edtech.edu/achievements/degree/image",
"type": "Image",
"caption": "1EdTech University Degree"
},
"name": "1EdTech University Degree",
"otherIdentifier": [
{
"type": "IdentifierEntry",
"identifier": "abde",
"identifierType": "identifier"
}
],
"resultDescription": [
{
"id": "urn:uuid:f6ab24cd-86e8-4eaf-b8c6-ded74e8fd41c",
"type": [
"ResultDescription"
],
"alignment": [
{
"type": [
"Alignment"
],
"targetCode": "project",
"targetDescription": "Project description",
"targetName": "Final Project",
"targetFramework": "1EdTech University Program and Course Catalog"
,
"targetType": "CFItem",
"targetUrl": "https://1edtech.edu/catalog/degree/project"
}
],
"allowedValue": [
"D",
"C",
"B",
"A"
],
"name": "Final Project Grade",
"requiredValue": "C",
"resultType": "LetterGrade"
},
{
"id": "urn:uuid:a70ddc6a-4c4a-4bd8-8277-cb97c79f40c5",
"type": [
"ResultDescription"
],
"alignment": [
{
"type": [
"Alignment"
],
"targetCode": "project",
"targetDescription": "Project description",
"targetName": "Final Project",
"targetFramework": "1EdTech University Program and Course Catalog"
,
"targetType": "CFItem",
"targetUrl": "https://1edtech.edu/catalog/degree/project"
}
],
"allowedValue": [
"D",
"C",
"B",
"A"
],
"name": "Final Project Grade",
"requiredLevel": "urn:uuid:d05a0867-d0ad-4b03-bdb5-28fb5d2aab7a",
"resultType": "RubricCriterionLevel",
"rubricCriterionLevel": [
{
"id": "urn:uuid:d05a0867-d0ad-4b03-bdb5-28fb5d2aab7a",
"type": [
"RubricCriterionLevel"
],
"alignment": [
{
"type": [
"Alignment"
],
"targetCode": "project",
"targetDescription": "Project description",
"targetName": "Final Project",
"targetFramework": "1EdTech University Program and Course Cata
log",
"targetType": "CFRubricCriterionLevel",
"targetUrl": "https://1edtech.edu/catalog/degree/project/rubri
c/levels/mastered"
}
],
"description": "The author demonstrated...",
"level": "Mastered",
"name": "Mastery",
"points": "4"
},
{
"id": "urn:uuid:6b84b429-31ee-4dac-9d20-e5c55881f80e",
"type": [
"RubricCriterionLevel"
],
"alignment": [
{
"type": [
"Alignment"
],
"targetCode": "project",
"targetDescription": "Project description",
"targetName": "Final Project",
"targetFramework": "1EdTech University Program and Course Cata
log",
"targetType": "CFRubricCriterionLevel",
"targetUrl": "https://1edtech.edu/catalog/degree/project/rubri
c/levels/basic"
}
],
"description": "The author demonstrated...",
"level": "Basic",
"name": "Basic",
"points": "4"
}
]
},
{
"id": "urn:uuid:b07c0387-f2d6-4b65-a3f4-f4e4302ea8f7",
"type": [
"ResultDescription"
],
"name": "Project Status",
"resultType": "Status"
}
],
"specialization": "Computer Science Research",
"tag": [
"research",
"computer science"
]
},
"image": {
"id": "https://1edtech.edu/credentials/3732/image",
"type": "Image",
"caption": "1EdTech University Degree for Example Student"
},
"narrative": "There is a final project report and source code evidence.",
"result": [
{
"type": [
"Result"
],
"alignment": [
{
"type": [
"Alignment"
],
"targetCode": "project",
"targetDescription": "Project description",
"targetName": "Final Project",
"targetFramework": "1EdTech University Program and Course Catalog",
"targetType": "CFItem",
"targetUrl": "https://1edtech.edu/catalog/degree/project/result/1"
}
],
"resultDescription": "urn:uuid:f6ab24cd-86e8-4eaf-b8c6-ded74e8fd41c",
"value": "A"
},
{
"type": [
"Result"
],
"achievedLevel": "urn:uuid:d05a0867-d0ad-4b03-bdb5-28fb5d2aab7a",
"alignment": [
{
"type": [
"Alignment"
],
"targetCode": "project",
"targetDescription": "Project description",
"targetName": "Final Project",
"targetFramework": "1EdTech University Program and Course Catalog",
"targetType": "CFItem",
"targetUrl": "https://1edtech.edu/catalog/degree/project/result/1"
}
],
"resultDescription": "urn:uuid:f6ab24cd-86e8-4eaf-b8c6-ded74e8fd41c"
},
{
"type": [
"Result"
],
"resultDescription": "urn:uuid:f6ab24cd-86e8-4eaf-b8c6-ded74e8fd41c",
"status": "Completed"
}
]
},
"endorsement": [
{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
],
"id": "http://1edtech.edu/endorsementcredential/3735",
"type": [
"VerifiableCredential",
"EndorsementCredential"
],
"name": "EAA endorsement",
"issuer": {
"id": "https://accrediter.edu/issuers/565049",
"type": [
"Profile"
],
"name": "Example Accrediting Agency"
},
"validFrom": "2010-01-01T00:00:00Z",
"validUntil": "2020-01-01T00:00:00Z",
"credentialSubject": {
"id": "https://1edtech.edu/issuers/565049",
"type": [
"EndorsementSubject"
],
"endorsementComment": "1EdTech University is in good standing"
},
"credentialSchema": [
{
"id": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_end
orsementcredential_schema.json",
"type": "1EdTechJsonSchemaValidator2019"
},
{
"id": "https://accrediter.edu/schema/endorsementcredential.json",
"type": "1EdTechJsonSchemaValidator2019"
}
],
"credentialStatus": {
"id": "https://1edtech.edu/credentials/3732/revocations",
"type": "1EdTechRevocationList"
},
"refreshService": {
"id": "http://1edtech.edu/credentials/3732",
"type": "1EdTechCredentialRefresh"
},
"proof": [
{
"type": "DataIntegrityProof",
"cryptosuite": "eddsa-rdf-2022",
"created": "2022-05-26T18:17:08Z",
"verificationMethod": "https://accrediter.edu/issuers/565049#zvPkQiUFf
JrgnCRhyPkTSkgrGXbnLR15pHH5HZVYNdM4TCAwQHqG7fMeMPLtYNRnEgoV1aJdR5E61eWu5sWRYgtA"
,
"proofPurpose": "assertionMethod",
"proofValue": "zvPkQiUFfJrgnCRhyPkTSkgrGXbnLR15pHH5HZVYNdM4TCAwQHqG7fM
eMPLtYNRnEgoV1aJdR5E61eWu5sWRYgtA"
}
]
}
],
"evidence": [
{
"id": "https://1edtech.edu/credentials/3732/evidence/1",
"type": [
"Evidence"
],
"narrative": "# Final Project Report \n This project was ...",
"name": "Final Project Report",
"description": "This is the final project report.",
"genre": "Research",
"audience": "Department"
},
{
"id": "https://github.com/somebody/project",
"type": [
"Evidence"
],
"name": "Final Project Code",
"description": "This is the source code for the final project app.",
"genre": "Research",
"audience": "Department"
}
],
"issuer": {
"id": "https://1edtech.edu/issuers/565049",
"type": [
"Profile"
],
"name": "1EdTech University",
"url": "https://1edtech.edu",
"phone": "1-222-333-4444",
"description": "1EdTech University provides online degree programs.",
"endorsement": [
{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
],
"id": "http://1edtech.edu/endorsementcredential/3736",
"type": [
"VerifiableCredential",
"EndorsementCredential"
],
"name": "EAA endorsement",
"issuer": {
"id": "https://accrediter.edu/issuers/565049",
"type": [
"Profile"
],
"name": "Example Accrediting Agency"
},
"validFrom": "2010-01-01T00:00:00Z",
"validUntil": "2020-01-01T00:00:00Z",
"credentialSubject": {
"id": "https://1edtech.edu/issuers/565049",
"type": [
"EndorsementSubject"
],
"endorsementComment": "1EdTech University is in good standing"
},
"credentialSchema": [
{
"id": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_e
ndorsementcredential_schema.json",
"type": "1EdTechJsonSchemaValidator2019"
},
{
"id": "https://accrediter.edu/schema/endorsementcredential.json",
"type": "1EdTechJsonSchemaValidator2019"
}
],
"credentialStatus": {
"id": "https://1edtech.edu/credentials/3732/revocations",
"type": "1EdTechRevocationList"
},
"refreshService": {
"id": "http://1edtech.edu/credentials/3732",
"type": "1EdTechCredentialRefresh"
},
"proof": [
{
"type": "DataIntegrityProof",
"cryptosuite": "eddsa-rdf-2022",
"created": "2022-05-26T18:17:08Z",
"verificationMethod": "https://accrediter.edu/issuers/565049#zvPkQiU
FfJrgnCRhyPkTSkgrGXbnLR15pHH5HZVYNdM4TCAwQHqG7fMeMPLtYNRnEgoV1aJdR5E61eWu5sWRYgt
A",
"proofPurpose": "assertionMethod",
"proofValue": "zvPkQiUFfJrgnCRhyPkTSkgrGXbnLR15pHH5HZVYNdM4TCAwQHqG7
fMeMPLtYNRnEgoV1aJdR5E61eWu5sWRYgtA"
}
]
}
],
"image": {
"id": "https://1edtech.edu/logo.png",
"type": "Image",
"caption": "1EdTech University logo"
},
"email": "registrar@1edtech.edu",
"address": {
"type": [
"Address"
],
"addressCountry": "USA",
"addressCountryCode": "US",
"addressRegion": "TX",
"addressLocality": "Austin",
"streetAddress": "123 First St",
"postOfficeBoxNumber": "1",
"postalCode": "12345",
"geo": {
"type": "GeoCoordinates",
"latitude": 1,
"longitude": 1
}
},
"otherIdentifier": [
{
"type": "IdentifierEntry",
"identifier": "12345",
"identifierType": "sourcedId"
},
{
"type": "IdentifierEntry",
"identifier": "67890",
"identifierType": "nationalIdentityNumber"
}
],
"official": "Horace Mann",
"parentOrg": {
"id": "did:example:123456789",
"type": [
"Profile"
],
"name": "Universal Universities"
}
},
"validFrom": "2010-01-01T00:00:00Z",
"validUntil": "2030-01-01T00:00:00Z",
"credentialSchema": [
{
"id": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achieve
mentcredential_schema.json",
"type": "1EdTechJsonSchemaValidator2019"
}
],
"credentialStatus": {
"id": "https://1edtech.edu/credentials/3732/revocations",
"type": "1EdTechRevocationList"
},
"refreshService": {
"id": "http://1edtech.edu/credentials/3732",
"type": "1EdTechCredentialRefresh"
},
"iss": "https://1edtech.edu/issuers/565049",
"jti": "http://1edtech.edu/credentials/3732",
"sub": "did:example:ebfeb1f712ebc6f1c276e12ec21"
}
--------------- JWT ---------------
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImp3ayI6eyJlIjoiQVFBQiIsImt0eSI6IlJTQSIsIm4i
OiJxaFp2SVRUVUtoME5QSnpTSzJXLTRRc0Q5dnpveHgwR3FBTS1URkw2WC03V0huTGFGRlU3TjV1bzF2
c0lOOGhLTVNxS1dyeURuanhtbW5hMldxN0VMOVpjNVZvaUg1YVN0NTFiRUE2cEM1Y0puWGJ5Tl93S2Nz
TDQ4eHNsZXVlb01PcGtKQnZDc3Z5NXV2MzMtdTJraDRPTUZib3VYSUxKc2NrQUkzNzhZMlVJemF1MWhV
NmtOc1dMLVlZZ0JqbEk3aVpkbEpRUVdobGcyVW9TbFNVTzdaTElmdDVOVjVUeVQwcGJjN1NhYS1CUWZV
UDF0NlVwNU1rVzhUd1d6QjRxSkNFQ2tPdEdQQng2SV9OcFJTOWFPU2I5SThwelc0RzNrelBfbkpUdjhf
TDV4M0hGSURvRnozZXhoRHRwWnQ2MHZzSDRJREplamZLeGphQWUxZUF4T3cifX0.eyJAY29udGV4dCI6
WyJodHRwczovL3d3dy53My5vcmcvbnMvY3JlZGVudGlhbHMvdjIiLCJodHRwczovL3B1cmwuaW1zZ2xv
YmFsLm9yZy9zcGVjL29iL3YzcDAvY29udGV4dC0zLjAuMy5qc29uIiwiaHR0cHM6Ly9wdXJsLmltc2ds
b2JhbC5vcmcvc3BlYy9vYi92M3AwL2V4dGVuc2lvbnMuanNvbiJdLCJpZCI6Imh0dHA6Ly8xZWR0ZWNo
LmVkdS9jcmVkZW50aWFscy8zNzMyIiwidHlwZSI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIk9wZW5C
YWRnZUNyZWRlbnRpYWwiXSwibmFtZSI6IjFFZFRlY2ggVW5pdmVyc2l0eSBEZWdyZWUgZm9yIEV4YW1w
bGUgU3R1ZGVudCIsImRlc2NyaXB0aW9uIjoiMUVkVGVjaCBVbml2ZXJzaXR5IERlZ3JlZSBEZXNjcmlw
dGlvbiIsImltYWdlIjp7ImlkIjoiaHR0cHM6Ly8xZWR0ZWNoLmVkdS9jcmVkZW50aWFscy8zNzMyL2lt
YWdlIiwidHlwZSI6IkltYWdlIiwiY2FwdGlvbiI6IjFFZFRlY2ggVW5pdmVyc2l0eSBEZWdyZWUgZm9y
IEV4YW1wbGUgU3R1ZGVudCJ9LCJjcmVkZW50aWFsU3ViamVjdCI6eyJpZCI6ImRpZDpleGFtcGxlOmVi
ZmViMWY3MTJlYmM2ZjFjMjc2ZTEyZWMyMSIsInR5cGUiOlsiQWNoaWV2ZW1lbnRTdWJqZWN0Il0sImFj
dGl2aXR5RW5kRGF0ZSI6IjIwMTAtMDEtMDJUMDA6MDA6MDBaIiwiYWN0aXZpdHlTdGFydERhdGUiOiIy
MDEwLTAxLTAxVDAwOjAwOjAwWiIsImNyZWRpdHNFYXJuZWQiOjQyLCJsaWNlbnNlTnVtYmVyIjoiQS05
MzIwMDQxIiwicm9sZSI6Ik1ham9yIERvbW8iLCJzb3VyY2UiOnsiaWQiOiJodHRwczovL3NjaG9vbC5l
ZHUvaXNzdWVycy8yMDEyMzQiLCJ0eXBlIjpbIlByb2ZpbGUiXSwibmFtZSI6IjFFZFRlY2ggQ29sbGVn
ZSBvZiBBcnRzIn0sInRlcm0iOiJGYWxsIiwiaWRlbnRpZmllciI6W3sidHlwZSI6IklkZW50aXR5T2Jq
ZWN0IiwiaWRlbnRpdHlIYXNoIjoic3R1ZGVudEAxZWR0ZWNoLmVkdSIsImlkZW50aXR5VHlwZSI6ImVt
YWlsQWRkcmVzcyIsImhhc2hlZCI6ZmFsc2UsInNhbHQiOiJub3QtdXNlZCJ9LHsidHlwZSI6IklkZW50
aXR5T2JqZWN0IiwiaWRlbnRpdHlIYXNoIjoic29tZWJvZHlAZ21haWwuY29tIiwiaWRlbnRpdHlUeXBl
IjoiZW1haWxBZGRyZXNzIiwiaGFzaGVkIjpmYWxzZSwic2FsdCI6Im5vdC11c2VkIn1dLCJhY2hpZXZl
bWVudCI6eyJpZCI6Imh0dHBzOi8vMWVkdGVjaC5lZHUvYWNoaWV2ZW1lbnRzL2RlZ3JlZSIsInR5cGUi
OlsiQWNoaWV2ZW1lbnQiXSwiYWxpZ25tZW50IjpbeyJ0eXBlIjpbIkFsaWdubWVudCJdLCJ0YXJnZXRD
b2RlIjoiZGVncmVlIiwidGFyZ2V0RGVzY3JpcHRpb24iOiIxRWRUZWNoIFVuaXZlcnNpdHkgRGVncmVl
IHByb2dyYW1zLiIsInRhcmdldE5hbWUiOiIxRWRUZWNoIFVuaXZlcnNpdHkgRGVncmVlIiwidGFyZ2V0
RnJhbWV3b3JrIjoiMUVkVGVjaCBVbml2ZXJzaXR5IFByb2dyYW0gYW5kIENvdXJzZSBDYXRhbG9nIiwi
dGFyZ2V0VHlwZSI6IkNGSXRlbSIsInRhcmdldFVybCI6Imh0dHBzOi8vMWVkdGVjaC5lZHUvY2F0YWxv
Zy9kZWdyZWUifSx7InR5cGUiOlsiQWxpZ25tZW50Il0sInRhcmdldENvZGUiOiJkZWdyZWUiLCJ0YXJn
ZXREZXNjcmlwdGlvbiI6IjFFZFRlY2ggVW5pdmVyc2l0eSBEZWdyZWUgcHJvZ3JhbXMuIiwidGFyZ2V0
TmFtZSI6IjFFZFRlY2ggVW5pdmVyc2l0eSBEZWdyZWUiLCJ0YXJnZXRGcmFtZXdvcmsiOiIxRWRUZWNo
IFVuaXZlcnNpdHkgUHJvZ3JhbSBhbmQgQ291cnNlIENhdGFsb2ciLCJ0YXJnZXRUeXBlIjoiQ1RETCIs
InRhcmdldFVybCI6Imh0dHBzOi8vY3JlZGVudGlhbGVuZ2luZXJlZ2lzdHJ5Lm9yZy9yZXNvdXJjZXMv
Y2UtOThjYjAyN2ItOTVlZi00NDk0LTkwOGQtNmY3NzkwZWM2YjZiIn1dLCJhY2hpZXZlbWVudFR5cGUi
OiJEZWdyZWUiLCJjcmVhdG9yIjp7ImlkIjoiaHR0cHM6Ly8xZWR0ZWNoLmVkdS9pc3N1ZXJzLzU2NTA0
OSIsInR5cGUiOlsiUHJvZmlsZSJdLCJuYW1lIjoiMUVkVGVjaCBVbml2ZXJzaXR5IiwidXJsIjoiaHR0
cHM6Ly8xZWR0ZWNoLmVkdSIsInBob25lIjoiMS0yMjItMzMzLTQ0NDQiLCJkZXNjcmlwdGlvbiI6IjFF
ZFRlY2ggVW5pdmVyc2l0eSBwcm92aWRlcyBvbmxpbmUgZGVncmVlIHByb2dyYW1zLiIsImVuZG9yc2Vt
ZW50IjpbeyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvbnMvY3JlZGVudGlhbHMvdjIiLCJo
dHRwczovL3B1cmwuaW1zZ2xvYmFsLm9yZy9zcGVjL29iL3YzcDAvY29udGV4dC0zLjAuMy5qc29uIl0s
ImlkIjoiaHR0cDovLzFlZHRlY2guZWR1L2VuZG9yc2VtZW50Y3JlZGVudGlhbC8zNzMyIiwidHlwZSI6
WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIkVuZG9yc2VtZW50Q3JlZGVudGlhbCJdLCJuYW1lIjoiU0RF
IGVuZG9yc2VtZW50IiwiaXNzdWVyIjp7ImlkIjoiaHR0cHM6Ly9hY2NyZWRpdGVyLmVkdS9pc3N1ZXJz
LzU2NTA0OSIsInR5cGUiOlsiUHJvZmlsZSJdLCJuYW1lIjoiRXhhbXBsZSBBY2NyZWRpdGluZyBBZ2Vu
Y3kifSwidmFsaWRGcm9tIjoiMjAxMC0wMS0wMVQwMDowMDowMFoiLCJ2YWxpZFVudGlsIjoiMjAyMC0w
MS0wMVQwMDowMDowMFoiLCJjcmVkZW50aWFsU3ViamVjdCI6eyJpZCI6Imh0dHBzOi8vMWVkdGVjaC5l
ZHUvaXNzdWVycy81NjUwNDkiLCJ0eXBlIjpbIkVuZG9yc2VtZW50U3ViamVjdCJdLCJlbmRvcnNlbWVu
dENvbW1lbnQiOiIxRWRUZWNoIFVuaXZlcnNpdHkgaXMgaW4gZ29vZCBzdGFuZGluZyJ9LCJjcmVkZW50
aWFsU2NoZW1hIjpbeyJpZCI6Imh0dHBzOi8vcHVybC5pbXNnbG9iYWwub3JnL3NwZWMvb2IvdjNwMC9z
Y2hlbWEvanNvbi9vYl92M3AwX2VuZG9yc2VtZW50Y3JlZGVudGlhbF9zY2hlbWEuanNvbiIsInR5cGUi
OiIxRWRUZWNoSnNvblNjaGVtYVZhbGlkYXRvcjIwMTkifSx7ImlkIjoiaHR0cHM6Ly9hY2NyZWRpdGVy
LmVkdS9zY2hlbWEvZW5kb3JzZW1lbnRjcmVkZW50aWFsLmpzb24iLCJ0eXBlIjoiMUVkVGVjaEpzb25T
Y2hlbWFWYWxpZGF0b3IyMDE5In1dLCJjcmVkZW50aWFsU3RhdHVzIjp7ImlkIjoiaHR0cHM6Ly8xZWR0
ZWNoLmVkdS9jcmVkZW50aWFscy8zNzMyL3Jldm9jYXRpb25zIiwidHlwZSI6IjFFZFRlY2hSZXZvY2F0
aW9uTGlzdCJ9LCJyZWZyZXNoU2VydmljZSI6eyJpZCI6Imh0dHA6Ly8xZWR0ZWNoLmVkdS9jcmVkZW50
aWFscy8zNzMyIiwidHlwZSI6IjFFZFRlY2hDcmVkZW50aWFsUmVmcmVzaCJ9LCJwcm9vZiI6W3sidHlw
ZSI6IkRhdGFJbnRlZ3JpdHlQcm9vZiIsImNyeXB0b3N1aXRlIjoiZWRkc2EtcmRmLTIwMjIiLCJjcmVh
dGVkIjoiMjAyMi0wNS0yNlQxODoxNzowOFoiLCJ2ZXJpZmljYXRpb25NZXRob2QiOiJodHRwczovL2Fj
Y3JlZGl0ZXIuZWR1L2lzc3VlcnMvNTY1MDQ5I3p2UGtRaVVGZkpyZ25DUmh5UGtUU2tnckdYYm5MUjE1
cEhINUhaVllOZE00VENBd1FIcUc3Zk1lTVBMdFlOUm5FZ29WMWFKZFI1RTYxZVd1NXNXUllndEEiLCJw
cm9vZlB1cnBvc2UiOiJhc3NlcnRpb25NZXRob2QiLCJwcm9vZlZhbHVlIjoienZQa1FpVUZmSnJnbkNS
aHlQa1RTa2dyR1hibkxSMTVwSEg1SFpWWU5kTTRUQ0F3UUhxRzdmTWVNUEx0WU5SbkVnb1YxYUpkUjVF
NjFlV3U1c1dSWWd0QSJ9XX0seyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvbnMvY3JlZGVu
dGlhbHMvdjIiLCJodHRwczovL3B1cmwuaW1zZ2xvYmFsLm9yZy9zcGVjL29iL3YzcDAvY29udGV4dC0z
LjAuMy5qc29uIl0sImlkIjoiaHR0cDovLzFlZHRlY2guZWR1L2VuZG9yc2VtZW50Y3JlZGVudGlhbC8z
NzMzIiwidHlwZSI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIkVuZG9yc2VtZW50Q3JlZGVudGlhbCJd
LCJuYW1lIjoiU0RFIGVuZG9yc2VtZW50IiwiaXNzdWVyIjp7ImlkIjoiaHR0cHM6Ly9zdGF0ZS5nb3Yv
aXNzdWVycy81NjUwNDkiLCJ0eXBlIjpbIlByb2ZpbGUiXSwibmFtZSI6IlN0YXRlIERlcGFydG1lbnQg
b2YgRWR1Y2F0aW9uIn0sInZhbGlkRnJvbSI6IjIwMTAtMDEtMDFUMDA6MDA6MDBaIiwidmFsaWRVbnRp
bCI6IjIwMjAtMDEtMDFUMDA6MDA6MDBaIiwiY3JlZGVudGlhbFN1YmplY3QiOnsiaWQiOiJodHRwczov
LzFlZHRlY2guZWR1L2lzc3VlcnMvNTY1MDQ5IiwidHlwZSI6WyJFbmRvcnNlbWVudFN1YmplY3QiXSwi
ZW5kb3JzZW1lbnRDb21tZW50IjoiMUVkVGVjaCBVbml2ZXJzaXR5IGlzIGluIGdvb2Qgc3RhbmRpbmci
fSwiY3JlZGVudGlhbFNjaGVtYSI6W3siaWQiOiJodHRwczovL3B1cmwuaW1zZ2xvYmFsLm9yZy9zcGVj
L29iL3YzcDAvc2NoZW1hL2pzb24vb2JfdjNwMF9lbmRvcnNlbWVudGNyZWRlbnRpYWxfc2NoZW1hLmpz
b24iLCJ0eXBlIjoiMUVkVGVjaEpzb25TY2hlbWFWYWxpZGF0b3IyMDE5In0seyJpZCI6Imh0dHBzOi8v
c3RhdGUuZ292L3NjaGVtYS9lbmRvcnNlbWVudGNyZWRlbnRpYWwuanNvbiIsInR5cGUiOiIxRWRUZWNo
SnNvblNjaGVtYVZhbGlkYXRvcjIwMTkifV0sImNyZWRlbnRpYWxTdGF0dXMiOnsiaWQiOiJodHRwczov
L3N0YXRlLmdvdi9jcmVkZW50aWFscy8zNzMyL3Jldm9jYXRpb25zIiwidHlwZSI6IjFFZFRlY2hSZXZv
Y2F0aW9uTGlzdCJ9LCJyZWZyZXNoU2VydmljZSI6eyJpZCI6Imh0dHA6Ly9zdGF0ZS5nb3YvY3JlZGVu
dGlhbHMvMzczMiIsInR5cGUiOiIxRWRUZWNoQ3JlZGVudGlhbFJlZnJlc2gifSwicHJvb2YiOlt7InR5
cGUiOiJEYXRhSW50ZWdyaXR5UHJvb2YiLCJjcnlwdG9zdWl0ZSI6ImVkZHNhLXJkZi0yMDIyIiwiY3Jl
YXRlZCI6IjIwMjItMDUtMjZUMTg6MjU6NTlaIiwidmVyaWZpY2F0aW9uTWV0aG9kIjoiaHR0cHM6Ly9h
Y2NyZWRpdGVyLmVkdS9pc3N1ZXJzLzU2NTA0OSN6NWJEbm1TZ0Rjelh3Wkd5YTZaanhLYXhrZEt4enND
TWlWU3NnRVZXeG5hV0s3WnFiS256Y0NkN21VS0U5RFFhQUwyUU1YUDVBcXVQZVc2VzJDV3JaN2pOQyIs
InByb29mUHVycG9zZSI6ImFzc2VydGlvbk1ldGhvZCIsInByb29mVmFsdWUiOiJ6NWJEbm1TZ0Rjelh3
Wkd5YTZaanhLYXhrZEt4enNDTWlWU3NnRVZXeG5hV0s3WnFiS256Y0NkN21VS0U5RFFhQUwyUU1YUDVB
cXVQZVc2VzJDV3JaN2pOQyJ9XX1dLCJpbWFnZSI6eyJpZCI6Imh0dHBzOi8vMWVkdGVjaC5lZHUvbG9n
by5wbmciLCJ0eXBlIjoiSW1hZ2UiLCJjYXB0aW9uIjoiMUVkVGVjaCBVbml2ZXJzaXR5IGxvZ28ifSwi
ZW1haWwiOiJyZWdpc3RyYXJAMWVkdGVjaC5lZHUiLCJhZGRyZXNzIjp7InR5cGUiOlsiQWRkcmVzcyJd
LCJhZGRyZXNzQ291bnRyeSI6IlVTQSIsImFkZHJlc3NDb3VudHJ5Q29kZSI6IlVTIiwiYWRkcmVzc1Jl
Z2lvbiI6IlRYIiwiYWRkcmVzc0xvY2FsaXR5IjoiQXVzdGluIiwic3RyZWV0QWRkcmVzcyI6IjEyMyBG
aXJzdCBTdCIsInBvc3RPZmZpY2VCb3hOdW1iZXIiOiIxIiwicG9zdGFsQ29kZSI6IjEyMzQ1IiwiZ2Vv
Ijp7InR5cGUiOiJHZW9Db29yZGluYXRlcyIsImxhdGl0dWRlIjoxLCJsb25naXR1ZGUiOjF9fSwib3Ro
ZXJJZGVudGlmaWVyIjpbeyJ0eXBlIjoiSWRlbnRpZmllckVudHJ5IiwiaWRlbnRpZmllciI6IjEyMzQ1
IiwiaWRlbnRpZmllclR5cGUiOiJzb3VyY2VkSWQifSx7InR5cGUiOiJJZGVudGlmaWVyRW50cnkiLCJp
ZGVudGlmaWVyIjoiNjc4OTAiLCJpZGVudGlmaWVyVHlwZSI6Im5hdGlvbmFsSWRlbnRpdHlOdW1iZXIi
fV0sIm9mZmljaWFsIjoiSG9yYWNlIE1hbm4iLCJwYXJlbnRPcmciOnsiaWQiOiJkaWQ6ZXhhbXBsZTox
MjM0NTY3ODkiLCJ0eXBlIjpbIlByb2ZpbGUiXSwibmFtZSI6IlVuaXZlcnNhbCBVbml2ZXJzaXRpZXMi
fX0sImNyZWRpdHNBdmFpbGFibGUiOjM2LCJjcml0ZXJpYSI6eyJpZCI6Imh0dHBzOi8vMWVkdGVjaC5l
ZHUvYWNoaWV2ZW1lbnRzL2RlZ3JlZSIsIm5hcnJhdGl2ZSI6IiMgRGVncmVlIFJlcXVpcmVtZW50c1xu
U3R1ZGVudHMgbXVzdCBjb21wbGV0ZS4uLiJ9LCJkZXNjcmlwdGlvbiI6IjFFZFRlY2ggVW5pdmVyc2l0
eSBEZWdyZWUgRGVzY3JpcHRpb24iLCJlbmRvcnNlbWVudCI6W3siQGNvbnRleHQiOlsiaHR0cHM6Ly93
d3cudzMub3JnL25zL2NyZWRlbnRpYWxzL3YyIiwiaHR0cHM6Ly9wdXJsLmltc2dsb2JhbC5vcmcvc3Bl
Yy9vYi92M3AwL2NvbnRleHQtMy4wLjMuanNvbiJdLCJpZCI6Imh0dHA6Ly8xZWR0ZWNoLmVkdS9lbmRv
cnNlbWVudGNyZWRlbnRpYWwvMzczNCIsInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJFbmRv
cnNlbWVudENyZWRlbnRpYWwiXSwibmFtZSI6IkVBQSBlbmRvcnNlbWVudCIsImlzc3VlciI6eyJpZCI6
Imh0dHBzOi8vYWNjcmVkaXRlci5lZHUvaXNzdWVycy81NjUwNDkiLCJ0eXBlIjpbIlByb2ZpbGUiXSwi
bmFtZSI6IkV4YW1wbGUgQWNjcmVkaXRpbmcgQWdlbmN5In0sInZhbGlkRnJvbSI6IjIwMTAtMDEtMDFU
MDA6MDA6MDBaIiwidmFsaWRVbnRpbCI6IjIwMjAtMDEtMDFUMDA6MDA6MDBaIiwiY3JlZGVudGlhbFN1
YmplY3QiOnsiaWQiOiJodHRwczovLzFlZHRlY2guZWR1L2lzc3VlcnMvNTY1MDQ5IiwidHlwZSI6WyJF
bmRvcnNlbWVudFN1YmplY3QiXSwiZW5kb3JzZW1lbnRDb21tZW50IjoiMUVkVGVjaCBVbml2ZXJzaXR5
IGlzIGluIGdvb2Qgc3RhbmRpbmcifSwiY3JlZGVudGlhbFNjaGVtYSI6W3siaWQiOiJodHRwczovL3B1
cmwuaW1zZ2xvYmFsLm9yZy9zcGVjL29iL3YzcDAvc2NoZW1hL2pzb24vb2JfdjNwMF9lbmRvcnNlbWVu
dGNyZWRlbnRpYWxfc2NoZW1hLmpzb24iLCJ0eXBlIjoiMUVkVGVjaEpzb25TY2hlbWFWYWxpZGF0b3Iy
MDE5In0seyJpZCI6Imh0dHBzOi8vYWNjcmVkaXRlci5lZHUvc2NoZW1hL2VuZG9yc2VtZW50Y3JlZGVu
dGlhbC5qc29uIiwidHlwZSI6IjFFZFRlY2hKc29uU2NoZW1hVmFsaWRhdG9yMjAxOSJ9XSwiY3JlZGVu
dGlhbFN0YXR1cyI6eyJpZCI6Imh0dHBzOi8vMWVkdGVjaC5lZHUvY3JlZGVudGlhbHMvMzczMi9yZXZv
Y2F0aW9ucyIsInR5cGUiOiIxRWRUZWNoUmV2b2NhdGlvbkxpc3QifSwicmVmcmVzaFNlcnZpY2UiOnsi
aWQiOiJodHRwOi8vMWVkdGVjaC5lZHUvY3JlZGVudGlhbHMvMzczMiIsInR5cGUiOiIxRWRUZWNoQ3Jl
ZGVudGlhbFJlZnJlc2gifSwicHJvb2YiOlt7InR5cGUiOiJEYXRhSW50ZWdyaXR5UHJvb2YiLCJjcnlw
dG9zdWl0ZSI6ImVkZHNhLXJkZi0yMDIyIiwiY3JlYXRlZCI6IjIwMjItMDUtMjZUMTg6MTc6MDhaIiwi
dmVyaWZpY2F0aW9uTWV0aG9kIjoiaHR0cHM6Ly9hY2NyZWRpdGVyLmVkdS9pc3N1ZXJzLzU2NTA0OSN6
dlBrUWlVRmZKcmduQ1JoeVBrVFNrZ3JHWGJuTFIxNXBISDVIWlZZTmRNNFRDQXdRSHFHN2ZNZU1QTHRZ
TlJuRWdvVjFhSmRSNUU2MWVXdTVzV1JZZ3RBIiwicHJvb2ZQdXJwb3NlIjoiYXNzZXJ0aW9uTWV0aG9k
IiwicHJvb2ZWYWx1ZSI6Inp2UGtRaVVGZkpyZ25DUmh5UGtUU2tnckdYYm5MUjE1cEhINUhaVllOZE00
VENBd1FIcUc3Zk1lTVBMdFlOUm5FZ29WMWFKZFI1RTYxZVd1NXNXUllndEEifV19XSwiZmllbGRPZlN0
dWR5IjoiUmVzZWFyY2giLCJodW1hbkNvZGUiOiJSMSIsImltYWdlIjp7ImlkIjoiaHR0cHM6Ly8xZWR0
ZWNoLmVkdS9hY2hpZXZlbWVudHMvZGVncmVlL2ltYWdlIiwidHlwZSI6IkltYWdlIiwiY2FwdGlvbiI6
IjFFZFRlY2ggVW5pdmVyc2l0eSBEZWdyZWUifSwibmFtZSI6IjFFZFRlY2ggVW5pdmVyc2l0eSBEZWdy
ZWUiLCJvdGhlcklkZW50aWZpZXIiOlt7InR5cGUiOiJJZGVudGlmaWVyRW50cnkiLCJpZGVudGlmaWVy
IjoiYWJkZSIsImlkZW50aWZpZXJUeXBlIjoiaWRlbnRpZmllciJ9XSwicmVzdWx0RGVzY3JpcHRpb24i
Olt7ImlkIjoidXJuOnV1aWQ6ZjZhYjI0Y2QtODZlOC00ZWFmLWI4YzYtZGVkNzRlOGZkNDFjIiwidHlw
ZSI6WyJSZXN1bHREZXNjcmlwdGlvbiJdLCJhbGlnbm1lbnQiOlt7InR5cGUiOlsiQWxpZ25tZW50Il0s
InRhcmdldENvZGUiOiJwcm9qZWN0IiwidGFyZ2V0RGVzY3JpcHRpb24iOiJQcm9qZWN0IGRlc2NyaXB0
aW9uIiwidGFyZ2V0TmFtZSI6IkZpbmFsIFByb2plY3QiLCJ0YXJnZXRGcmFtZXdvcmsiOiIxRWRUZWNo
IFVuaXZlcnNpdHkgUHJvZ3JhbSBhbmQgQ291cnNlIENhdGFsb2ciLCJ0YXJnZXRUeXBlIjoiQ0ZJdGVt
IiwidGFyZ2V0VXJsIjoiaHR0cHM6Ly8xZWR0ZWNoLmVkdS9jYXRhbG9nL2RlZ3JlZS9wcm9qZWN0In1d
LCJhbGxvd2VkVmFsdWUiOlsiRCIsIkMiLCJCIiwiQSJdLCJuYW1lIjoiRmluYWwgUHJvamVjdCBHcmFk
ZSIsInJlcXVpcmVkVmFsdWUiOiJDIiwicmVzdWx0VHlwZSI6IkxldHRlckdyYWRlIn0seyJpZCI6InVy
bjp1dWlkOmE3MGRkYzZhLTRjNGEtNGJkOC04Mjc3LWNiOTdjNzlmNDBjNSIsInR5cGUiOlsiUmVzdWx0
RGVzY3JpcHRpb24iXSwiYWxpZ25tZW50IjpbeyJ0eXBlIjpbIkFsaWdubWVudCJdLCJ0YXJnZXRDb2Rl
IjoicHJvamVjdCIsInRhcmdldERlc2NyaXB0aW9uIjoiUHJvamVjdCBkZXNjcmlwdGlvbiIsInRhcmdl
dE5hbWUiOiJGaW5hbCBQcm9qZWN0IiwidGFyZ2V0RnJhbWV3b3JrIjoiMUVkVGVjaCBVbml2ZXJzaXR5
IFByb2dyYW0gYW5kIENvdXJzZSBDYXRhbG9nIiwidGFyZ2V0VHlwZSI6IkNGSXRlbSIsInRhcmdldFVy
bCI6Imh0dHBzOi8vMWVkdGVjaC5lZHUvY2F0YWxvZy9kZWdyZWUvcHJvamVjdCJ9XSwiYWxsb3dlZFZh
bHVlIjpbIkQiLCJDIiwiQiIsIkEiXSwibmFtZSI6IkZpbmFsIFByb2plY3QgR3JhZGUiLCJyZXF1aXJl
ZExldmVsIjoidXJuOnV1aWQ6ZDA1YTA4NjctZDBhZC00YjAzLWJkYjUtMjhmYjVkMmFhYjdhIiwicmVz
dWx0VHlwZSI6IlJ1YnJpY0NyaXRlcmlvbkxldmVsIiwicnVicmljQ3JpdGVyaW9uTGV2ZWwiOlt7Imlk
IjoidXJuOnV1aWQ6ZDA1YTA4NjctZDBhZC00YjAzLWJkYjUtMjhmYjVkMmFhYjdhIiwidHlwZSI6WyJS
dWJyaWNDcml0ZXJpb25MZXZlbCJdLCJhbGlnbm1lbnQiOlt7InR5cGUiOlsiQWxpZ25tZW50Il0sInRh
cmdldENvZGUiOiJwcm9qZWN0IiwidGFyZ2V0RGVzY3JpcHRpb24iOiJQcm9qZWN0IGRlc2NyaXB0aW9u
IiwidGFyZ2V0TmFtZSI6IkZpbmFsIFByb2plY3QiLCJ0YXJnZXRGcmFtZXdvcmsiOiIxRWRUZWNoIFVu
aXZlcnNpdHkgUHJvZ3JhbSBhbmQgQ291cnNlIENhdGFsb2ciLCJ0YXJnZXRUeXBlIjoiQ0ZSdWJyaWND
cml0ZXJpb25MZXZlbCIsInRhcmdldFVybCI6Imh0dHBzOi8vMWVkdGVjaC5lZHUvY2F0YWxvZy9kZWdy
ZWUvcHJvamVjdC9ydWJyaWMvbGV2ZWxzL21hc3RlcmVkIn1dLCJkZXNjcmlwdGlvbiI6IlRoZSBhdXRo
b3IgZGVtb25zdHJhdGVkLi4uIiwibGV2ZWwiOiJNYXN0ZXJlZCIsIm5hbWUiOiJNYXN0ZXJ5IiwicG9p
bnRzIjoiNCJ9LHsiaWQiOiJ1cm46dXVpZDo2Yjg0YjQyOS0zMWVlLTRkYWMtOWQyMC1lNWM1NTg4MWY4
MGUiLCJ0eXBlIjpbIlJ1YnJpY0NyaXRlcmlvbkxldmVsIl0sImFsaWdubWVudCI6W3sidHlwZSI6WyJB
bGlnbm1lbnQiXSwidGFyZ2V0Q29kZSI6InByb2plY3QiLCJ0YXJnZXREZXNjcmlwdGlvbiI6IlByb2pl
Y3QgZGVzY3JpcHRpb24iLCJ0YXJnZXROYW1lIjoiRmluYWwgUHJvamVjdCIsInRhcmdldEZyYW1ld29y
ayI6IjFFZFRlY2ggVW5pdmVyc2l0eSBQcm9ncmFtIGFuZCBDb3Vyc2UgQ2F0YWxvZyIsInRhcmdldFR5
cGUiOiJDRlJ1YnJpY0NyaXRlcmlvbkxldmVsIiwidGFyZ2V0VXJsIjoiaHR0cHM6Ly8xZWR0ZWNoLmVk
dS9jYXRhbG9nL2RlZ3JlZS9wcm9qZWN0L3J1YnJpYy9sZXZlbHMvYmFzaWMifV0sImRlc2NyaXB0aW9u
IjoiVGhlIGF1dGhvciBkZW1vbnN0cmF0ZWQuLi4iLCJsZXZlbCI6IkJhc2ljIiwibmFtZSI6IkJhc2lj
IiwicG9pbnRzIjoiNCJ9XX0seyJpZCI6InVybjp1dWlkOmIwN2MwMzg3LWYyZDYtNGI2NS1hM2Y0LWY0
ZTQzMDJlYThmNyIsInR5cGUiOlsiUmVzdWx0RGVzY3JpcHRpb24iXSwibmFtZSI6IlByb2plY3QgU3Rh
dHVzIiwicmVzdWx0VHlwZSI6IlN0YXR1cyJ9XSwic3BlY2lhbGl6YXRpb24iOiJDb21wdXRlciBTY2ll
bmNlIFJlc2VhcmNoIiwidGFnIjpbInJlc2VhcmNoIiwiY29tcHV0ZXIgc2NpZW5jZSJdfSwiaW1hZ2Ui
OnsiaWQiOiJodHRwczovLzFlZHRlY2guZWR1L2NyZWRlbnRpYWxzLzM3MzIvaW1hZ2UiLCJ0eXBlIjoi
SW1hZ2UiLCJjYXB0aW9uIjoiMUVkVGVjaCBVbml2ZXJzaXR5IERlZ3JlZSBmb3IgRXhhbXBsZSBTdHVk
ZW50In0sIm5hcnJhdGl2ZSI6IlRoZXJlIGlzIGEgZmluYWwgcHJvamVjdCByZXBvcnQgYW5kIHNvdXJj
ZSBjb2RlIGV2aWRlbmNlLiIsInJlc3VsdCI6W3sidHlwZSI6WyJSZXN1bHQiXSwiYWxpZ25tZW50Ijpb
eyJ0eXBlIjpbIkFsaWdubWVudCJdLCJ0YXJnZXRDb2RlIjoicHJvamVjdCIsInRhcmdldERlc2NyaXB0
aW9uIjoiUHJvamVjdCBkZXNjcmlwdGlvbiIsInRhcmdldE5hbWUiOiJGaW5hbCBQcm9qZWN0IiwidGFy
Z2V0RnJhbWV3b3JrIjoiMUVkVGVjaCBVbml2ZXJzaXR5IFByb2dyYW0gYW5kIENvdXJzZSBDYXRhbG9n
IiwidGFyZ2V0VHlwZSI6IkNGSXRlbSIsInRhcmdldFVybCI6Imh0dHBzOi8vMWVkdGVjaC5lZHUvY2F0
YWxvZy9kZWdyZWUvcHJvamVjdC9yZXN1bHQvMSJ9XSwicmVzdWx0RGVzY3JpcHRpb24iOiJ1cm46dXVp
ZDpmNmFiMjRjZC04NmU4LTRlYWYtYjhjNi1kZWQ3NGU4ZmQ0MWMiLCJ2YWx1ZSI6IkEifSx7InR5cGUi
OlsiUmVzdWx0Il0sImFjaGlldmVkTGV2ZWwiOiJ1cm46dXVpZDpkMDVhMDg2Ny1kMGFkLTRiMDMtYmRi
NS0yOGZiNWQyYWFiN2EiLCJhbGlnbm1lbnQiOlt7InR5cGUiOlsiQWxpZ25tZW50Il0sInRhcmdldENv
ZGUiOiJwcm9qZWN0IiwidGFyZ2V0RGVzY3JpcHRpb24iOiJQcm9qZWN0IGRlc2NyaXB0aW9uIiwidGFy
Z2V0TmFtZSI6IkZpbmFsIFByb2plY3QiLCJ0YXJnZXRGcmFtZXdvcmsiOiIxRWRUZWNoIFVuaXZlcnNp
dHkgUHJvZ3JhbSBhbmQgQ291cnNlIENhdGFsb2ciLCJ0YXJnZXRUeXBlIjoiQ0ZJdGVtIiwidGFyZ2V0
VXJsIjoiaHR0cHM6Ly8xZWR0ZWNoLmVkdS9jYXRhbG9nL2RlZ3JlZS9wcm9qZWN0L3Jlc3VsdC8xIn1d
LCJyZXN1bHREZXNjcmlwdGlvbiI6InVybjp1dWlkOmY2YWIyNGNkLTg2ZTgtNGVhZi1iOGM2LWRlZDc0
ZThmZDQxYyJ9LHsidHlwZSI6WyJSZXN1bHQiXSwicmVzdWx0RGVzY3JpcHRpb24iOiJ1cm46dXVpZDpm
NmFiMjRjZC04NmU4LTRlYWYtYjhjNi1kZWQ3NGU4ZmQ0MWMiLCJzdGF0dXMiOiJDb21wbGV0ZWQifV19
LCJlbmRvcnNlbWVudCI6W3siQGNvbnRleHQiOlsiaHR0cHM6Ly93d3cudzMub3JnL25zL2NyZWRlbnRp
YWxzL3YyIiwiaHR0cHM6Ly9wdXJsLmltc2dsb2JhbC5vcmcvc3BlYy9vYi92M3AwL2NvbnRleHQtMy4w
LjMuanNvbiJdLCJpZCI6Imh0dHA6Ly8xZWR0ZWNoLmVkdS9lbmRvcnNlbWVudGNyZWRlbnRpYWwvMzcz
NSIsInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJFbmRvcnNlbWVudENyZWRlbnRpYWwiXSwi
bmFtZSI6IkVBQSBlbmRvcnNlbWVudCIsImlzc3VlciI6eyJpZCI6Imh0dHBzOi8vYWNjcmVkaXRlci5l
ZHUvaXNzdWVycy81NjUwNDkiLCJ0eXBlIjpbIlByb2ZpbGUiXSwibmFtZSI6IkV4YW1wbGUgQWNjcmVk
aXRpbmcgQWdlbmN5In0sInZhbGlkRnJvbSI6IjIwMTAtMDEtMDFUMDA6MDA6MDBaIiwidmFsaWRVbnRp
bCI6IjIwMjAtMDEtMDFUMDA6MDA6MDBaIiwiY3JlZGVudGlhbFN1YmplY3QiOnsiaWQiOiJodHRwczov
LzFlZHRlY2guZWR1L2lzc3VlcnMvNTY1MDQ5IiwidHlwZSI6WyJFbmRvcnNlbWVudFN1YmplY3QiXSwi
ZW5kb3JzZW1lbnRDb21tZW50IjoiMUVkVGVjaCBVbml2ZXJzaXR5IGlzIGluIGdvb2Qgc3RhbmRpbmci
fSwiY3JlZGVudGlhbFNjaGVtYSI6W3siaWQiOiJodHRwczovL3B1cmwuaW1zZ2xvYmFsLm9yZy9zcGVj
L29iL3YzcDAvc2NoZW1hL2pzb24vb2JfdjNwMF9lbmRvcnNlbWVudGNyZWRlbnRpYWxfc2NoZW1hLmpz
b24iLCJ0eXBlIjoiMUVkVGVjaEpzb25TY2hlbWFWYWxpZGF0b3IyMDE5In0seyJpZCI6Imh0dHBzOi8v
YWNjcmVkaXRlci5lZHUvc2NoZW1hL2VuZG9yc2VtZW50Y3JlZGVudGlhbC5qc29uIiwidHlwZSI6IjFF
ZFRlY2hKc29uU2NoZW1hVmFsaWRhdG9yMjAxOSJ9XSwiY3JlZGVudGlhbFN0YXR1cyI6eyJpZCI6Imh0
dHBzOi8vMWVkdGVjaC5lZHUvY3JlZGVudGlhbHMvMzczMi9yZXZvY2F0aW9ucyIsInR5cGUiOiIxRWRU
ZWNoUmV2b2NhdGlvbkxpc3QifSwicmVmcmVzaFNlcnZpY2UiOnsiaWQiOiJodHRwOi8vMWVkdGVjaC5l
ZHUvY3JlZGVudGlhbHMvMzczMiIsInR5cGUiOiIxRWRUZWNoQ3JlZGVudGlhbFJlZnJlc2gifSwicHJv
b2YiOlt7InR5cGUiOiJEYXRhSW50ZWdyaXR5UHJvb2YiLCJjcnlwdG9zdWl0ZSI6ImVkZHNhLXJkZi0y
MDIyIiwiY3JlYXRlZCI6IjIwMjItMDUtMjZUMTg6MTc6MDhaIiwidmVyaWZpY2F0aW9uTWV0aG9kIjoi
aHR0cHM6Ly9hY2NyZWRpdGVyLmVkdS9pc3N1ZXJzLzU2NTA0OSN6dlBrUWlVRmZKcmduQ1JoeVBrVFNr
Z3JHWGJuTFIxNXBISDVIWlZZTmRNNFRDQXdRSHFHN2ZNZU1QTHRZTlJuRWdvVjFhSmRSNUU2MWVXdTVz
V1JZZ3RBIiwicHJvb2ZQdXJwb3NlIjoiYXNzZXJ0aW9uTWV0aG9kIiwicHJvb2ZWYWx1ZSI6Inp2UGtR
aVVGZkpyZ25DUmh5UGtUU2tnckdYYm5MUjE1cEhINUhaVllOZE00VENBd1FIcUc3Zk1lTVBMdFlOUm5F
Z29WMWFKZFI1RTYxZVd1NXNXUllndEEifV19XSwiZXZpZGVuY2UiOlt7ImlkIjoiaHR0cHM6Ly8xZWR0
ZWNoLmVkdS9jcmVkZW50aWFscy8zNzMyL2V2aWRlbmNlLzEiLCJ0eXBlIjpbIkV2aWRlbmNlIl0sIm5h
cnJhdGl2ZSI6IiMgRmluYWwgUHJvamVjdCBSZXBvcnQgXG4gVGhpcyBwcm9qZWN0IHdhcyAuLi4iLCJu
YW1lIjoiRmluYWwgUHJvamVjdCBSZXBvcnQiLCJkZXNjcmlwdGlvbiI6IlRoaXMgaXMgdGhlIGZpbmFs
IHByb2plY3QgcmVwb3J0LiIsImdlbnJlIjoiUmVzZWFyY2giLCJhdWRpZW5jZSI6IkRlcGFydG1lbnQi
fSx7ImlkIjoiaHR0cHM6Ly9naXRodWIuY29tL3NvbWVib2R5L3Byb2plY3QiLCJ0eXBlIjpbIkV2aWRl
bmNlIl0sIm5hbWUiOiJGaW5hbCBQcm9qZWN0IENvZGUiLCJkZXNjcmlwdGlvbiI6IlRoaXMgaXMgdGhl
IHNvdXJjZSBjb2RlIGZvciB0aGUgZmluYWwgcHJvamVjdCBhcHAuIiwiZ2VucmUiOiJSZXNlYXJjaCIs
ImF1ZGllbmNlIjoiRGVwYXJ0bWVudCJ9XSwiaXNzdWVyIjp7ImlkIjoiaHR0cHM6Ly8xZWR0ZWNoLmVk
dS9pc3N1ZXJzLzU2NTA0OSIsInR5cGUiOlsiUHJvZmlsZSJdLCJuYW1lIjoiMUVkVGVjaCBVbml2ZXJz
aXR5IiwidXJsIjoiaHR0cHM6Ly8xZWR0ZWNoLmVkdSIsInBob25lIjoiMS0yMjItMzMzLTQ0NDQiLCJk
ZXNjcmlwdGlvbiI6IjFFZFRlY2ggVW5pdmVyc2l0eSBwcm92aWRlcyBvbmxpbmUgZGVncmVlIHByb2dy
YW1zLiIsImVuZG9yc2VtZW50IjpbeyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvbnMvY3Jl
ZGVudGlhbHMvdjIiLCJodHRwczovL3B1cmwuaW1zZ2xvYmFsLm9yZy9zcGVjL29iL3YzcDAvY29udGV4
dC0zLjAuMy5qc29uIl0sImlkIjoiaHR0cDovLzFlZHRlY2guZWR1L2VuZG9yc2VtZW50Y3JlZGVudGlh
bC8zNzM2IiwidHlwZSI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIkVuZG9yc2VtZW50Q3JlZGVudGlh
bCJdLCJuYW1lIjoiRUFBIGVuZG9yc2VtZW50IiwiaXNzdWVyIjp7ImlkIjoiaHR0cHM6Ly9hY2NyZWRp
dGVyLmVkdS9pc3N1ZXJzLzU2NTA0OSIsInR5cGUiOlsiUHJvZmlsZSJdLCJuYW1lIjoiRXhhbXBsZSBB
Y2NyZWRpdGluZyBBZ2VuY3kifSwidmFsaWRGcm9tIjoiMjAxMC0wMS0wMVQwMDowMDowMFoiLCJ2YWxp
ZFVudGlsIjoiMjAyMC0wMS0wMVQwMDowMDowMFoiLCJjcmVkZW50aWFsU3ViamVjdCI6eyJpZCI6Imh0
dHBzOi8vMWVkdGVjaC5lZHUvaXNzdWVycy81NjUwNDkiLCJ0eXBlIjpbIkVuZG9yc2VtZW50U3ViamVj
dCJdLCJlbmRvcnNlbWVudENvbW1lbnQiOiIxRWRUZWNoIFVuaXZlcnNpdHkgaXMgaW4gZ29vZCBzdGFu
ZGluZyJ9LCJjcmVkZW50aWFsU2NoZW1hIjpbeyJpZCI6Imh0dHBzOi8vcHVybC5pbXNnbG9iYWwub3Jn
L3NwZWMvb2IvdjNwMC9zY2hlbWEvanNvbi9vYl92M3AwX2VuZG9yc2VtZW50Y3JlZGVudGlhbF9zY2hl
bWEuanNvbiIsInR5cGUiOiIxRWRUZWNoSnNvblNjaGVtYVZhbGlkYXRvcjIwMTkifSx7ImlkIjoiaHR0
cHM6Ly9hY2NyZWRpdGVyLmVkdS9zY2hlbWEvZW5kb3JzZW1lbnRjcmVkZW50aWFsLmpzb24iLCJ0eXBl
IjoiMUVkVGVjaEpzb25TY2hlbWFWYWxpZGF0b3IyMDE5In1dLCJjcmVkZW50aWFsU3RhdHVzIjp7Imlk
IjoiaHR0cHM6Ly8xZWR0ZWNoLmVkdS9jcmVkZW50aWFscy8zNzMyL3Jldm9jYXRpb25zIiwidHlwZSI6
IjFFZFRlY2hSZXZvY2F0aW9uTGlzdCJ9LCJyZWZyZXNoU2VydmljZSI6eyJpZCI6Imh0dHA6Ly8xZWR0
ZWNoLmVkdS9jcmVkZW50aWFscy8zNzMyIiwidHlwZSI6IjFFZFRlY2hDcmVkZW50aWFsUmVmcmVzaCJ9
LCJwcm9vZiI6W3sidHlwZSI6IkRhdGFJbnRlZ3JpdHlQcm9vZiIsImNyeXB0b3N1aXRlIjoiZWRkc2Et
cmRmLTIwMjIiLCJjcmVhdGVkIjoiMjAyMi0wNS0yNlQxODoxNzowOFoiLCJ2ZXJpZmljYXRpb25NZXRo
b2QiOiJodHRwczovL2FjY3JlZGl0ZXIuZWR1L2lzc3VlcnMvNTY1MDQ5I3p2UGtRaVVGZkpyZ25DUmh5
UGtUU2tnckdYYm5MUjE1cEhINUhaVllOZE00VENBd1FIcUc3Zk1lTVBMdFlOUm5FZ29WMWFKZFI1RTYx
ZVd1NXNXUllndEEiLCJwcm9vZlB1cnBvc2UiOiJhc3NlcnRpb25NZXRob2QiLCJwcm9vZlZhbHVlIjoi
enZQa1FpVUZmSnJnbkNSaHlQa1RTa2dyR1hibkxSMTVwSEg1SFpWWU5kTTRUQ0F3UUhxRzdmTWVNUEx0
WU5SbkVnb1YxYUpkUjVFNjFlV3U1c1dSWWd0QSJ9XX1dLCJpbWFnZSI6eyJpZCI6Imh0dHBzOi8vMWVk
dGVjaC5lZHUvbG9nby5wbmciLCJ0eXBlIjoiSW1hZ2UiLCJjYXB0aW9uIjoiMUVkVGVjaCBVbml2ZXJz
aXR5IGxvZ28ifSwiZW1haWwiOiJyZWdpc3RyYXJAMWVkdGVjaC5lZHUiLCJhZGRyZXNzIjp7InR5cGUi
OlsiQWRkcmVzcyJdLCJhZGRyZXNzQ291bnRyeSI6IlVTQSIsImFkZHJlc3NDb3VudHJ5Q29kZSI6IlVT
IiwiYWRkcmVzc1JlZ2lvbiI6IlRYIiwiYWRkcmVzc0xvY2FsaXR5IjoiQXVzdGluIiwic3RyZWV0QWRk
cmVzcyI6IjEyMyBGaXJzdCBTdCIsInBvc3RPZmZpY2VCb3hOdW1iZXIiOiIxIiwicG9zdGFsQ29kZSI6
IjEyMzQ1IiwiZ2VvIjp7InR5cGUiOiJHZW9Db29yZGluYXRlcyIsImxhdGl0dWRlIjoxLCJsb25naXR1
ZGUiOjF9fSwib3RoZXJJZGVudGlmaWVyIjpbeyJ0eXBlIjoiSWRlbnRpZmllckVudHJ5IiwiaWRlbnRp
ZmllciI6IjEyMzQ1IiwiaWRlbnRpZmllclR5cGUiOiJzb3VyY2VkSWQifSx7InR5cGUiOiJJZGVudGlm
aWVyRW50cnkiLCJpZGVudGlmaWVyIjoiNjc4OTAiLCJpZGVudGlmaWVyVHlwZSI6Im5hdGlvbmFsSWRl
bnRpdHlOdW1iZXIifV0sIm9mZmljaWFsIjoiSG9yYWNlIE1hbm4iLCJwYXJlbnRPcmciOnsiaWQiOiJk
aWQ6ZXhhbXBsZToxMjM0NTY3ODkiLCJ0eXBlIjpbIlByb2ZpbGUiXSwibmFtZSI6IlVuaXZlcnNhbCBV
bml2ZXJzaXRpZXMifX0sInZhbGlkRnJvbSI6IjIwMTAtMDEtMDFUMDA6MDA6MDBaIiwidmFsaWRVbnRp
bCI6IjIwMzAtMDEtMDFUMDA6MDA6MDBaIiwiY3JlZGVudGlhbFNjaGVtYSI6W3siaWQiOiJodHRwczov
L3B1cmwuaW1zZ2xvYmFsLm9yZy9zcGVjL29iL3YzcDAvc2NoZW1hL2pzb24vb2JfdjNwMF9hY2hpZXZl
bWVudGNyZWRlbnRpYWxfc2NoZW1hLmpzb24iLCJ0eXBlIjoiMUVkVGVjaEpzb25TY2hlbWFWYWxpZGF0
b3IyMDE5In1dLCJjcmVkZW50aWFsU3RhdHVzIjp7ImlkIjoiaHR0cHM6Ly8xZWR0ZWNoLmVkdS9jcmVk
ZW50aWFscy8zNzMyL3Jldm9jYXRpb25zIiwidHlwZSI6IjFFZFRlY2hSZXZvY2F0aW9uTGlzdCJ9LCJy
ZWZyZXNoU2VydmljZSI6eyJpZCI6Imh0dHA6Ly8xZWR0ZWNoLmVkdS9jcmVkZW50aWFscy8zNzMyIiwi
dHlwZSI6IjFFZFRlY2hDcmVkZW50aWFsUmVmcmVzaCJ9LCJpc3MiOiJodHRwczovLzFlZHRlY2guZWR1
L2lzc3VlcnMvNTY1MDQ5IiwianRpIjoiaHR0cDovLzFlZHRlY2guZWR1L2NyZWRlbnRpYWxzLzM3MzIi
LCJzdWIiOiJkaWQ6ZXhhbXBsZTplYmZlYjFmNzEyZWJjNmYxYzI3NmUxMmVjMjEifQ.OGf7vbMCbG4Np
YgzGfVV-0VhBcPgK5_pVPCHdGrzlAcMzcboR_xfMLqdeZWFewluR_wTl5-EbCFMn4HSDaJDGuuX3CHQL
iVAxCrhR-WrsR_MnMUn_brchfbOazZTIgn4TgSGwjJEM_0SMYdKDD_Q1SdY4EkPLndgLUzL9IW5lnX3w
vS28LqjwV3Qq_YxAl-z4xIKZiDck-i0XJizfz2G7myqS0chmaFwWt0PGkPS8qTMr6M_afjBMHDwaGWnW
2VdldVaH7VX12E14JN70z03XqpaC3dyksKzOqka1oBse4iYj_uXdBt7enZmqwoWDzFLovvZqrQWDCmh6
ybskf3Qmw

D.3 EndorsementCredential
Example 37: Sample EndorsementCredential

    Credential
    Verifiable Credential (with proof)
    Verifiable Credential (as JWT)

---------------- JWT header ---------------
{
"alg": "RS256",
"typ": "JWT",
"jwk": {
"e": "AQAB",
"kty": "RSA",
"n": "zQt8Xfpg5UcnvAFRYXqwBq7apH2c1GxAfvnvgyhyD33CL0gru83QyObnbcfV6Vf8SKxYeh
4X_xreK0I1KK7vwIwpjkquc7a917VqnP--EQoP-MX43ODIoyF1wYPIckk_JC4VUPNQQ8KNkyX3CHt5ym
nSiFmxjnrivngG4eAc_wNaM9uuYJYQY5oQMFH19_sk6O-WUy5UVUi98si3QbaxzbtaFKM3EIgegYXLrd
ZbuKP2jNnzaiabbLw_uxp6818HMUDxeRiotmXAaurHAMTmV4vMaJSJwhS8hxINI1c5qEMfZmW9CJWNLt
jIJQjCOuwVsZVNcFFyJjYj6xsrjBl_0w"
}
}
--------------- JWT payload ---------------
// NOTE: The example below uses a valid VC-JWT serialization
// that duplicates the iss, nbf, jti, and sub fields in the
// Verifiable Credential (vc) field.
{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
"https://purl.imsglobal.org/spec/ob/v3p0/extensions.json"
],
"id": "http://1edtech.edu/endorsementcredential/3732",
"type": [
"VerifiableCredential",
"EndorsementCredential"
],
"name": "SDE endorsement",
"issuer": {
"id": "https://state.gov/issuers/565049",
"type": [
"Profile"
],
"name": "State Department of Education"
},
"validFrom": "2010-01-01T00:00:00Z",
"validUntil": "2030-01-01T00:00:00Z",
"credentialSubject": {
"id": "https://1edtech.edu/issuers/565049",
"type": [
"EndorsementSubject"
],
"endorsementComment": "1EdTech University is in good standing"
},
"credentialSchema": [
{
"id": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_endorse
mentcredential_schema.json",
"type": "1EdTechJsonSchemaValidator2019"
},
{
"id": "https://state.gov/schema/endorsementcredential.json",
"type": "1EdTechJsonSchemaValidator2019"
}
],
"credentialStatus": {
"id": "https://state.gov/credentials/3732/revocations",
"type": "1EdTechRevocationList"
},
"refreshService": {
"id": "http://state.gov/credentials/3732",
"type": "1EdTechCredentialRefresh"
},
"iss": "https://state.gov/issuers/565049",
"jti": "http://1edtech.edu/endorsementcredential/3732",
"sub": "https://1edtech.edu/issuers/565049"
}
--------------- JWT ---------------
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImp3ayI6eyJlIjoiQVFBQiIsImt0eSI6IlJTQSIsIm4i
OiJ6UXQ4WGZwZzVVY252QUZSWVhxd0JxN2FwSDJjMUd4QWZ2bnZneWh5RDMzQ0wwZ3J1ODNReU9ibmJj
ZlY2VmY4U0t4WWVoNFhfeHJlSzBJMUtLN3Z3SXdwamtxdWM3YTkxN1ZxblAtLUVRb1AtTVg0M09ESW95
RjF3WVBJY2trX0pDNFZVUE5RUThLTmt5WDNDSHQ1eW1uU2lGbXhqbnJpdm5nRzRlQWNfd05hTTl1dVlK
WVFZNW9RTUZIMTlfc2s2Ty1XVXk1VVZVaTk4c2kzUWJheHpidGFGS00zRUlnZWdZWExyZFpidUtQMmpO
bnphaWFiYkx3X3V4cDY4MThITVVEeGVSaW90bVhBYXVySEFNVG1WNHZNYUpTSndoUzhoeElOSTFjNXFF
TWZabVc5Q0pXTkx0aklKUWpDT3V3VnNaVk5jRkZ5SmpZajZ4c3JqQmxfMHcifX0.eyJAY29udGV4dCI6
WyJodHRwczovL3d3dy53My5vcmcvbnMvY3JlZGVudGlhbHMvdjIiLCJodHRwczovL3B1cmwuaW1zZ2xv
YmFsLm9yZy9zcGVjL29iL3YzcDAvY29udGV4dC0zLjAuMy5qc29uIiwiaHR0cHM6Ly9wdXJsLmltc2ds
b2JhbC5vcmcvc3BlYy9vYi92M3AwL2V4dGVuc2lvbnMuanNvbiJdLCJpZCI6Imh0dHA6Ly8xZWR0ZWNo
LmVkdS9lbmRvcnNlbWVudGNyZWRlbnRpYWwvMzczMiIsInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRp
YWwiLCJFbmRvcnNlbWVudENyZWRlbnRpYWwiXSwibmFtZSI6IlNERSBlbmRvcnNlbWVudCIsImlzc3Vl
ciI6eyJpZCI6Imh0dHBzOi8vc3RhdGUuZ292L2lzc3VlcnMvNTY1MDQ5IiwidHlwZSI6WyJQcm9maWxl
Il0sIm5hbWUiOiJTdGF0ZSBEZXBhcnRtZW50IG9mIEVkdWNhdGlvbiJ9LCJ2YWxpZEZyb20iOiIyMDEw
LTAxLTAxVDAwOjAwOjAwWiIsInZhbGlkVW50aWwiOiIyMDMwLTAxLTAxVDAwOjAwOjAwWiIsImNyZWRl
bnRpYWxTdWJqZWN0Ijp7ImlkIjoiaHR0cHM6Ly8xZWR0ZWNoLmVkdS9pc3N1ZXJzLzU2NTA0OSIsInR5
cGUiOlsiRW5kb3JzZW1lbnRTdWJqZWN0Il0sImVuZG9yc2VtZW50Q29tbWVudCI6IjFFZFRlY2ggVW5p
dmVyc2l0eSBpcyBpbiBnb29kIHN0YW5kaW5nIn0sImNyZWRlbnRpYWxTY2hlbWEiOlt7ImlkIjoiaHR0
cHM6Ly9wdXJsLmltc2dsb2JhbC5vcmcvc3BlYy9vYi92M3AwL3NjaGVtYS9qc29uL29iX3YzcDBfZW5k
b3JzZW1lbnRjcmVkZW50aWFsX3NjaGVtYS5qc29uIiwidHlwZSI6IjFFZFRlY2hKc29uU2NoZW1hVmFs
aWRhdG9yMjAxOSJ9LHsiaWQiOiJodHRwczovL3N0YXRlLmdvdi9zY2hlbWEvZW5kb3JzZW1lbnRjcmVk
ZW50aWFsLmpzb24iLCJ0eXBlIjoiMUVkVGVjaEpzb25TY2hlbWFWYWxpZGF0b3IyMDE5In1dLCJjcmVk
ZW50aWFsU3RhdHVzIjp7ImlkIjoiaHR0cHM6Ly9zdGF0ZS5nb3YvY3JlZGVudGlhbHMvMzczMi9yZXZv
Y2F0aW9ucyIsInR5cGUiOiIxRWRUZWNoUmV2b2NhdGlvbkxpc3QifSwicmVmcmVzaFNlcnZpY2UiOnsi
aWQiOiJodHRwOi8vc3RhdGUuZ292L2NyZWRlbnRpYWxzLzM3MzIiLCJ0eXBlIjoiMUVkVGVjaENyZWRl
bnRpYWxSZWZyZXNoIn0sImlzcyI6Imh0dHBzOi8vc3RhdGUuZ292L2lzc3VlcnMvNTY1MDQ5IiwianRp
IjoiaHR0cDovLzFlZHRlY2guZWR1L2VuZG9yc2VtZW50Y3JlZGVudGlhbC8zNzMyIiwic3ViIjoiaHR0
cHM6Ly8xZWR0ZWNoLmVkdS9pc3N1ZXJzLzU2NTA0OSJ9.KJ_Px_9y41LK3wnRRP5fUtgKj9dGSWBVI37
YauEP0nzlY-ACwvJlnxZkWcCsDlrEH7Mbnfh161HKdrs-br7MoPiBZ2VFRC5wdkrmzCmltzMbCGeCJEv
5MGQGkqWDJauY_O5wVXftTvjfYhC4u_D23sAJf7PeLxXi7TrlPf557ll1N0xlHwmzoS2OD6VNQ8_LUFN
F47NcAoL0UwBo-QM-Z69DjfrN9Q2yKr4154yXG3-SbX0tclOeW7tbZ2Dbd6tAnZXPtPnr0x_IR5679-0
UsgCtSpe3goVRe-\_H83py8bS11FYy7qDtYdfbMqrrgRssghKJUrAG0kR7-c6dc1TbXQ

D.4 Achievement Alignment (CASE)
Example 38: Achievement alignment (CASE)

    Credential
    Verifiable Credential (with proof)
    Verifiable Credential (as JWT)

{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
],
"id": "http://example.edu/credentials/3732",
"type": ["VerifiableCredential", "OpenBadgeCredential"],
"issuer": {
"id": "https://example.edu/issuers/565049",
"type": ["Profile"],
"name": "Example University"
},
"validFrom": "2010-01-01T00:00:00Z",
"name": "Example University Degree",
"credentialSubject": {
"id": "did:example:ebfeb1f712ebc6f1c276e12ec21",
"type": ["AchievementSubject"],
"achievement": {
"id": "https://1edtech.edu/achievements/1",
"type": ["Achievement"],
"criteria": {
"narrative": "Cite strong and thorough textual evidence to support analysis of what the text says explicitly as well as inferences drawn from the text, including determining where the text leaves matters uncertain"
},
"description": "Analyze a sample text",
"name": "Text analysis",
"alignment": [{
"type": ["Alignment"],
"targetCode": "74f5bb7d-d7cc-11e8-824f-0242ac160002",
"targetFramework": "Alabama Course of Study: English Language Arts",
"targetName": "Cite strong and thorough textual evidence to support analysis of what the text says explicitly as well as inferences drawn from the text, including determining where the text leaves matters uncertain",
"targetType": "CFItem",
"targetUrl": "https://caseregistry.imsglobal.org/uri/74f5bb7d-d7cc-11e8-824f-0242ac160002"
}]
}
}
}

D.5 Achievement Alignment (Credential Engine)
Example 39: Achievement alignment (Credential Engine)

    Credential
    Verifiable Credential (with proof)
    Verifiable Credential (as JWT)

{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
],
"id": "http://example.edu/credentials/3732",
"type": ["VerifiableCredential", "OpenBadgeCredential"],
"issuer": {
"id": "https://example.edu/issuers/565049",
"type": ["Profile"],
"name": "Example University"
},
"validFrom": "2010-01-01T00:00:00Z",
"name": "Example University Degree",
"credentialSubject": {
"id": "did:example:ebfeb1f712ebc6f1c276e12ec21",
"type": ["AchievementSubject"],
"achievement": {
"id": "https://1edtech.edu/achievements/1",
"type": ["Achievement"],
"criteria": {
"narrative": "Cite strong and thorough textual evidence to support analysis of what the text says explicitly as well as inferences drawn from the text, including determining where the text leaves matters uncertain"
},
"description": "Analyze a sample text",
"name": "Text analysis",
"alignment": [{
"type": ["Alignment"],
"targetCode": "ce-cf4dee18-7cea-443a-b920-158a0762c6bf",
"targetFramework": "Edmonds College Course Catalog",
"targetName": "Requirements Analysis",
"targetType": "ceterms:Credential",
"targetUrl": "https://credentialfinder.org/credential/20229/Requirements_Analysis"
}]
}
}
}

D.6 Skill Assertion (CASE)
Note
A Skill Assertion credential is just like a basic OpenBadgeCredential in how an Achievement is included, except that it makes a claim referencing an Achievement that is generic to allow for use by many possible issuers. The Achievement here is aligned to a CASE CFItem.
Example 40: Skill Assertion (CASE)

    Credential
    Verifiable Credential (with proof)
    Verifiable Credential (as JWT)

---------------- JWT header ---------------
{
"alg": "RS256",
"typ": "JWT",
"jwk": {
"e": "AQAB",
"kty": "RSA",
"n": "qhZvITTUKh0NPJzSK2W-4QsD9vzoxx0GqAM-TFL6X-7WHnLaFFU7N5uo1vsIN8hKMSqKWr
yDnjxmmna2Wq7EL9Zc5VoiH5aSt51bEA6pC5cJnXbyN_wKcsL48xsleueoMOpkJBvCsvy5uv33-u2kh4
OMFbouXILJsckAI378Y2UIzau1hU6kNsWL-YYgBjlI7iZdlJQQWhlg2UoSlSUO7ZLIft5NV5TyT0pbc7
Saa-BQfUP1t6Up5MkW8TwWzB4qJCECkOtGPBx6I_NpRS9aOSb9I8pzW4G3kzP_nJTv8_L5x3HFIDoFz3
exhDtpZt60vsH4IDJejfKxjaAe1eAxOw"
}
}
--------------- JWT payload ---------------
// NOTE: The example below uses a valid VC-JWT serialization
// that duplicates the iss, nbf, jti, and sub fields in the
// Verifiable Credential (vc) field.
{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
"https://purl.imsglobal.org/spec/ob/v3p0/extensions.json"
],
"id": "http://1edtech.edu/credentials/3732",
"type": [
"VerifiableCredential",
"OpenBadgeCredential"
],
"name": "Robot Programming Skill Credential",
"description": "A badge recognizing the development of skills in robot impleme
ntation, specifically the software",
"credentialSubject": {
"id": "did:example:ebfeb1f712ebc6f1c276e12ec21",
"type": [
"AchievementSubject"
],
"achievement": {
"id": "https://example.com/achievements/robotics/robot-programming",
"type": [
"Achievement"
],
"alignment": [
{
"type": [
"Alignment"
],
"targetDescription": "Robot software is a set of commands and procedur
es robots use to respond to input and perform autonomous tasks.",
"targetName": "Robot Programming",
"targetFramework": "Example Robotics Framework",
"targetType": "CFItem",
"targetUrl": "https://robotics-competencies.example.com/competencies/r
obot-programming"
}
],
"achievementType": "Competency",
"creator": {
"id": "https://example.com/issuers/123767",
"type": [
"Profile"
],
"name": "Example Industry Group",
"url": "https://example.com",
"description": "Example Industry Group is a consortium of luminaries who
publish skills data for common usage.",
"email": "info@exammple.com"
},
"criteria": {
"narrative": "Learners must present source code showing the ability for
a robot to accept manual or sensor input and perform conditional actions in resp
onse."
},
"description": "This achievement represents developing capability to devel
op software for robotic applications.",
"image": {
"id": "https://example.com/achievements/robotics/robot-programming/image
",
"type": "Image",
"caption": "A robot filled with ones and zeroes representing its program
ming"
},
"name": "Robot Programming"
}
},
"evidence": [
{
"id": "https://github.com/somebody/project",
"type": [
"Evidence"
],
"name": "Final Project Code",
"description": "The source code for the 'Beeper 1.0' robot project. It res
ponds by saying 'beep' when the 'beep' button is pressed."
}
],
"issuer": {
"id": "https://1edtech.edu/issuers/565049",
"type": [
"Profile"
],
"name": "1EdTech University",
"url": "https://1edtech.edu",
"phone": "1-222-333-4444",
"description": "1EdTech University provides online degree programs.",
"image": {
"id": "https://1edtech.edu/logo.png",
"type": "Image",
"caption": "1EdTech University logo"
},
"email": "registrar@1edtech.edu"
},
"validFrom": "2022-07-01T00:00:00Z",
"credentialSchema": [
{
"id": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achieve
mentcredential_schema.json",
"type": "1EdTechJsonSchemaValidator2019"
}
],
"iss": "https://1edtech.edu/issuers/565049",
"jti": "http://1edtech.edu/credentials/3732",
"sub": "did:example:ebfeb1f712ebc6f1c276e12ec21"
}
--------------- JWT ---------------
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImp3ayI6eyJlIjoiQVFBQiIsImt0eSI6IlJTQSIsIm4i
OiJxaFp2SVRUVUtoME5QSnpTSzJXLTRRc0Q5dnpveHgwR3FBTS1URkw2WC03V0huTGFGRlU3TjV1bzF2
c0lOOGhLTVNxS1dyeURuanhtbW5hMldxN0VMOVpjNVZvaUg1YVN0NTFiRUE2cEM1Y0puWGJ5Tl93S2Nz
TDQ4eHNsZXVlb01PcGtKQnZDc3Z5NXV2MzMtdTJraDRPTUZib3VYSUxKc2NrQUkzNzhZMlVJemF1MWhV
NmtOc1dMLVlZZ0JqbEk3aVpkbEpRUVdobGcyVW9TbFNVTzdaTElmdDVOVjVUeVQwcGJjN1NhYS1CUWZV
UDF0NlVwNU1rVzhUd1d6QjRxSkNFQ2tPdEdQQng2SV9OcFJTOWFPU2I5SThwelc0RzNrelBfbkpUdjhf
TDV4M0hGSURvRnozZXhoRHRwWnQ2MHZzSDRJREplamZLeGphQWUxZUF4T3cifX0.eyJAY29udGV4dCI6
WyJodHRwczovL3d3dy53My5vcmcvbnMvY3JlZGVudGlhbHMvdjIiLCJodHRwczovL3B1cmwuaW1zZ2xv
YmFsLm9yZy9zcGVjL29iL3YzcDAvY29udGV4dC0zLjAuMy5qc29uIiwiaHR0cHM6Ly9wdXJsLmltc2ds
b2JhbC5vcmcvc3BlYy9vYi92M3AwL2V4dGVuc2lvbnMuanNvbiJdLCJpZCI6Imh0dHA6Ly8xZWR0ZWNo
LmVkdS9jcmVkZW50aWFscy8zNzMyIiwidHlwZSI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIk9wZW5C
YWRnZUNyZWRlbnRpYWwiXSwibmFtZSI6IlJvYm90IFByb2dyYW1taW5nIFNraWxsIENyZWRlbnRpYWwi
LCJkZXNjcmlwdGlvbiI6IkEgYmFkZ2UgcmVjb2duaXppbmcgdGhlIGRldmVsb3BtZW50IG9mIHNraWxs
cyBpbiByb2JvdCBpbXBsZW1lbnRhdGlvbiwgc3BlY2lmaWNhbGx5IHRoZSBzb2Z0d2FyZSIsImNyZWRl
bnRpYWxTdWJqZWN0Ijp7ImlkIjoiZGlkOmV4YW1wbGU6ZWJmZWIxZjcxMmViYzZmMWMyNzZlMTJlYzIx
IiwidHlwZSI6WyJBY2hpZXZlbWVudFN1YmplY3QiXSwiYWNoaWV2ZW1lbnQiOnsiaWQiOiJodHRwczov
L2V4YW1wbGUuY29tL2FjaGlldmVtZW50cy9yb2JvdGljcy9yb2JvdC1wcm9ncmFtbWluZyIsInR5cGUi
OlsiQWNoaWV2ZW1lbnQiXSwiYWxpZ25tZW50IjpbeyJ0eXBlIjpbIkFsaWdubWVudCJdLCJ0YXJnZXRE
ZXNjcmlwdGlvbiI6IlJvYm90IHNvZnR3YXJlIGlzIGEgc2V0IG9mIGNvbW1hbmRzIGFuZCBwcm9jZWR1
cmVzIHJvYm90cyB1c2UgdG8gcmVzcG9uZCB0byBpbnB1dCBhbmQgcGVyZm9ybSBhdXRvbm9tb3VzIHRh
c2tzLiIsInRhcmdldE5hbWUiOiJSb2JvdCBQcm9ncmFtbWluZyIsInRhcmdldEZyYW1ld29yayI6IkV4
YW1wbGUgUm9ib3RpY3MgRnJhbWV3b3JrIiwidGFyZ2V0VHlwZSI6IkNGSXRlbSIsInRhcmdldFVybCI6
Imh0dHBzOi8vcm9ib3RpY3MtY29tcGV0ZW5jaWVzLmV4YW1wbGUuY29tL2NvbXBldGVuY2llcy9yb2Jv
dC1wcm9ncmFtbWluZyJ9XSwiYWNoaWV2ZW1lbnRUeXBlIjoiQ29tcGV0ZW5jeSIsImNyZWF0b3IiOnsi
aWQiOiJodHRwczovL2V4YW1wbGUuY29tL2lzc3VlcnMvMTIzNzY3IiwidHlwZSI6WyJQcm9maWxlIl0s
Im5hbWUiOiJFeGFtcGxlIEluZHVzdHJ5IEdyb3VwIiwidXJsIjoiaHR0cHM6Ly9leGFtcGxlLmNvbSIs
ImRlc2NyaXB0aW9uIjoiRXhhbXBsZSBJbmR1c3RyeSBHcm91cCBpcyBhIGNvbnNvcnRpdW0gb2YgbHVt
aW5hcmllcyB3aG8gcHVibGlzaCBza2lsbHMgZGF0YSBmb3IgY29tbW9uIHVzYWdlLiIsImVtYWlsIjoi
aW5mb0BleGFtbXBsZS5jb20ifSwiY3JpdGVyaWEiOnsibmFycmF0aXZlIjoiTGVhcm5lcnMgbXVzdCBw
cmVzZW50IHNvdXJjZSBjb2RlIHNob3dpbmcgdGhlIGFiaWxpdHkgZm9yIGEgcm9ib3QgdG8gYWNjZXB0
IG1hbnVhbCBvciBzZW5zb3IgaW5wdXQgYW5kIHBlcmZvcm0gY29uZGl0aW9uYWwgYWN0aW9ucyBpbiBy
ZXNwb25zZS4ifSwiZGVzY3JpcHRpb24iOiJUaGlzIGFjaGlldmVtZW50IHJlcHJlc2VudHMgZGV2ZWxv
cGluZyBjYXBhYmlsaXR5IHRvIGRldmVsb3Agc29mdHdhcmUgZm9yIHJvYm90aWMgYXBwbGljYXRpb25z
LiIsImltYWdlIjp7ImlkIjoiaHR0cHM6Ly9leGFtcGxlLmNvbS9hY2hpZXZlbWVudHMvcm9ib3RpY3Mv
cm9ib3QtcHJvZ3JhbW1pbmcvaW1hZ2UiLCJ0eXBlIjoiSW1hZ2UiLCJjYXB0aW9uIjoiQSByb2JvdCBm
aWxsZWQgd2l0aCBvbmVzIGFuZCB6ZXJvZXMgcmVwcmVzZW50aW5nIGl0cyBwcm9ncmFtbWluZyJ9LCJu
YW1lIjoiUm9ib3QgUHJvZ3JhbW1pbmcifX0sImV2aWRlbmNlIjpbeyJpZCI6Imh0dHBzOi8vZ2l0aHVi
LmNvbS9zb21lYm9keS9wcm9qZWN0IiwidHlwZSI6WyJFdmlkZW5jZSJdLCJuYW1lIjoiRmluYWwgUHJv
amVjdCBDb2RlIiwiZGVzY3JpcHRpb24iOiJUaGUgc291cmNlIGNvZGUgZm9yIHRoZSAnQmVlcGVyIDEu
MCcgcm9ib3QgcHJvamVjdC4gSXQgcmVzcG9uZHMgYnkgc2F5aW5nICdiZWVwJyB3aGVuIHRoZSAnYmVl
cCcgYnV0dG9uIGlzIHByZXNzZWQuIn1dLCJpc3N1ZXIiOnsiaWQiOiJodHRwczovLzFlZHRlY2guZWR1
L2lzc3VlcnMvNTY1MDQ5IiwidHlwZSI6WyJQcm9maWxlIl0sIm5hbWUiOiIxRWRUZWNoIFVuaXZlcnNp
dHkiLCJ1cmwiOiJodHRwczovLzFlZHRlY2guZWR1IiwicGhvbmUiOiIxLTIyMi0zMzMtNDQ0NCIsImRl
c2NyaXB0aW9uIjoiMUVkVGVjaCBVbml2ZXJzaXR5IHByb3ZpZGVzIG9ubGluZSBkZWdyZWUgcHJvZ3Jh
bXMuIiwiaW1hZ2UiOnsiaWQiOiJodHRwczovLzFlZHRlY2guZWR1L2xvZ28ucG5nIiwidHlwZSI6Iklt
YWdlIiwiY2FwdGlvbiI6IjFFZFRlY2ggVW5pdmVyc2l0eSBsb2dvIn0sImVtYWlsIjoicmVnaXN0cmFy
QDFlZHRlY2guZWR1In0sInZhbGlkRnJvbSI6IjIwMjItMDctMDFUMDA6MDA6MDBaIiwiY3JlZGVudGlh
bFNjaGVtYSI6W3siaWQiOiJodHRwczovL3B1cmwuaW1zZ2xvYmFsLm9yZy9zcGVjL29iL3YzcDAvc2No
ZW1hL2pzb24vb2JfdjNwMF9hY2hpZXZlbWVudGNyZWRlbnRpYWxfc2NoZW1hLmpzb24iLCJ0eXBlIjoi
MUVkVGVjaEpzb25TY2hlbWFWYWxpZGF0b3IyMDE5In1dLCJpc3MiOiJodHRwczovLzFlZHRlY2guZWR1
L2lzc3VlcnMvNTY1MDQ5IiwianRpIjoiaHR0cDovLzFlZHRlY2guZWR1L2NyZWRlbnRpYWxzLzM3MzIi
LCJzdWIiOiJkaWQ6ZXhhbXBsZTplYmZlYjFmNzEyZWJjNmYxYzI3NmUxMmVjMjEifQ.IBUYpJeVtCnYt
Mv6IeJbem42COez9Q0KCLmiP-3wyb5y8R6w58TWFbrZHgRLb-JIE0Ht9bpDejRDPMStV2ia03ZeTm4Mx
Y2uhleOKgyp6SvhPB-v-hPRr3MJimdJEJ0_nzR983TajvdGuHrGbg7umazA3oHTSR482L4gq9mh2z6ZV
pVyB9opagkXYf81if6YleIDhhuPCYVdvaJQPLNh7TAekyO8f0hkBVH82T07kKSdIkVp3kc3SRikl9Min
7b10ZsgSUWVdZwK25CgwI0yZ6UPxBy5FSa-XmJnlXf8Ztvk84tc6LVVQMQ5aK9WKttTnrWiDwA7tkIUY
goUym43fw

D.7 Skill Assertion (Credential Engine)
Note
A Skill Assertion credential is just like a basic OpenBadgeCredential in how an Achievement is included, except that it makes a claim referencing an Achievement that is generic to allow for use by many possible issuers. The Achievement here is aligned to a Competency registered on the Credential Registry and described in CTDL.
Example 41: Skill Assertion (Credential Registry)

    Credential
    Verifiable Credential (with proof)
    Verifiable Credential (as JWT)

---------------- JWT header ---------------
{
"alg": "RS256",
"typ": "JWT",
"jwk": {
"e": "AQAB",
"kty": "RSA",
"n": "qhZvITTUKh0NPJzSK2W-4QsD9vzoxx0GqAM-TFL6X-7WHnLaFFU7N5uo1vsIN8hKMSqKWr
yDnjxmmna2Wq7EL9Zc5VoiH5aSt51bEA6pC5cJnXbyN_wKcsL48xsleueoMOpkJBvCsvy5uv33-u2kh4
OMFbouXILJsckAI378Y2UIzau1hU6kNsWL-YYgBjlI7iZdlJQQWhlg2UoSlSUO7ZLIft5NV5TyT0pbc7
Saa-BQfUP1t6Up5MkW8TwWzB4qJCECkOtGPBx6I_NpRS9aOSb9I8pzW4G3kzP_nJTv8_L5x3HFIDoFz3
exhDtpZt60vsH4IDJejfKxjaAe1eAxOw"
}
}
--------------- JWT payload ---------------
// NOTE: The example below uses a valid VC-JWT serialization
// that duplicates the iss, nbf, jti, and sub fields in the
// Verifiable Credential (vc) field.
{
"@context": [
"https://www.w3.org/ns/credentials/v2",
"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
"https://purl.imsglobal.org/spec/ob/v3p0/extensions.json"
],
"id": "http://1edtech.edu/credentials/3732",
"type": [
"VerifiableCredential",
"OpenBadgeCredential"
],
"name": "Solve and graph linear equations and inequalities",
"credentialSubject": {
"id": "did:example:ebfeb1f712ebc6f1c276e12ec21",
"type": [
"AchievementSubject"
],
"achievement": {
"id": "https://example.com/achievements/math/linear-1",
"type": [
"Achievement"
],
"alignment": [
{
"type": [
"Alignment"
],
"targetCode": "ce-6369c51f-4d86-4592-a761-8b32ae70a045",
"targetFramework": "Ivy Tech Community College of Indiana, MATH 135, F
INITE MATH",
"targetName": "Solve and graph linear equations and inequalities",
"targetType": "ceasn:Competency",
"targetUrl": "https://credentialfinder.org/competency/ce-6369c51f-4d86
-4592-a761-8b32ae70a045"
}
],
"achievementType": "Competency",
"creator": {
"id": "https://example.com/issuers/123767",
"type": [
"Profile"
],
"name": "Example Industry Group",
"url": "https://example.com",
"description": "Example Industry Group is a consortium of luminaries who
publish skills data for common usage.",
"email": "info@exammple.com"
},
"criteria": {
"narrative": "Learners must demonstrate understanding of linear algebra
and graphic representation of linear equations."
},
"description": "This achievement represents developing capability to solve
and graph linear equations and inequalities",
"image": {
"id": "https://example.com/achievements/math/linear-1/image",
"type": "Image",
"caption": "A line, sloping upward optimistically"
},
"name": "Linear equations and inequalities"
}
},
"issuer": {
"id": "https://1edtech.edu/issuers/565049",
"type": [
"Profile"
],
"name": "1EdTech University",
"url": "https://1edtech.edu",
"phone": "1-222-333-4444",
"description": "1EdTech University provides online degree programs.",
"image": {
"id": "https://1edtech.edu/logo.png",
"type": "Image",
"caption": "1EdTech University logo"
},
"email": "registrar@1edtech.edu"
},
"validFrom": "2022-07-01T00:00:00Z",
"credentialSchema": [
{
"id": "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achieve
mentcredential_schema.json",
"type": "1EdTechJsonSchemaValidator2019"
}
],
"iss": "https://1edtech.edu/issuers/565049",
"jti": "http://1edtech.edu/credentials/3732",
"sub": "did:example:ebfeb1f712ebc6f1c276e12ec21"
}
--------------- JWT ---------------
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImp3ayI6eyJlIjoiQVFBQiIsImt0eSI6IlJTQSIsIm4i
OiJxaFp2SVRUVUtoME5QSnpTSzJXLTRRc0Q5dnpveHgwR3FBTS1URkw2WC03V0huTGFGRlU3TjV1bzF2
c0lOOGhLTVNxS1dyeURuanhtbW5hMldxN0VMOVpjNVZvaUg1YVN0NTFiRUE2cEM1Y0puWGJ5Tl93S2Nz
TDQ4eHNsZXVlb01PcGtKQnZDc3Z5NXV2MzMtdTJraDRPTUZib3VYSUxKc2NrQUkzNzhZMlVJemF1MWhV
NmtOc1dMLVlZZ0JqbEk3aVpkbEpRUVdobGcyVW9TbFNVTzdaTElmdDVOVjVUeVQwcGJjN1NhYS1CUWZV
UDF0NlVwNU1rVzhUd1d6QjRxSkNFQ2tPdEdQQng2SV9OcFJTOWFPU2I5SThwelc0RzNrelBfbkpUdjhf
TDV4M0hGSURvRnozZXhoRHRwWnQ2MHZzSDRJREplamZLeGphQWUxZUF4T3cifX0.eyJAY29udGV4dCI6
WyJodHRwczovL3d3dy53My5vcmcvbnMvY3JlZGVudGlhbHMvdjIiLCJodHRwczovL3B1cmwuaW1zZ2xv
YmFsLm9yZy9zcGVjL29iL3YzcDAvY29udGV4dC0zLjAuMy5qc29uIiwiaHR0cHM6Ly9wdXJsLmltc2ds
b2JhbC5vcmcvc3BlYy9vYi92M3AwL2V4dGVuc2lvbnMuanNvbiJdLCJpZCI6Imh0dHA6Ly8xZWR0ZWNo
LmVkdS9jcmVkZW50aWFscy8zNzMyIiwidHlwZSI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIk9wZW5C
YWRnZUNyZWRlbnRpYWwiXSwibmFtZSI6IlNvbHZlIGFuZCBncmFwaCBsaW5lYXIgZXF1YXRpb25zIGFu
ZCBpbmVxdWFsaXRpZXMiLCJjcmVkZW50aWFsU3ViamVjdCI6eyJpZCI6ImRpZDpleGFtcGxlOmViZmVi
MWY3MTJlYmM2ZjFjMjc2ZTEyZWMyMSIsInR5cGUiOlsiQWNoaWV2ZW1lbnRTdWJqZWN0Il0sImFjaGll
dmVtZW50Ijp7ImlkIjoiaHR0cHM6Ly9leGFtcGxlLmNvbS9hY2hpZXZlbWVudHMvbWF0aC9saW5lYXIt
MSIsInR5cGUiOlsiQWNoaWV2ZW1lbnQiXSwiYWxpZ25tZW50IjpbeyJ0eXBlIjpbIkFsaWdubWVudCJd
LCJ0YXJnZXRDb2RlIjoiY2UtNjM2OWM1MWYtNGQ4Ni00NTkyLWE3NjEtOGIzMmFlNzBhMDQ1IiwidGFy
Z2V0RnJhbWV3b3JrIjoiSXZ5IFRlY2ggQ29tbXVuaXR5IENvbGxlZ2Ugb2YgSW5kaWFuYSwgTUFUSCAx
MzUsIEZJTklURSBNQVRIIiwidGFyZ2V0TmFtZSI6IlNvbHZlIGFuZCBncmFwaCBsaW5lYXIgZXF1YXRp
b25zIGFuZCBpbmVxdWFsaXRpZXMiLCJ0YXJnZXRUeXBlIjoiY2Vhc246Q29tcGV0ZW5jeSIsInRhcmdl
dFVybCI6Imh0dHBzOi8vY3JlZGVudGlhbGZpbmRlci5vcmcvY29tcGV0ZW5jeS9jZS02MzY5YzUxZi00
ZDg2LTQ1OTItYTc2MS04YjMyYWU3MGEwNDUifV0sImFjaGlldmVtZW50VHlwZSI6IkNvbXBldGVuY3ki
LCJjcmVhdG9yIjp7ImlkIjoiaHR0cHM6Ly9leGFtcGxlLmNvbS9pc3N1ZXJzLzEyMzc2NyIsInR5cGUi
OlsiUHJvZmlsZSJdLCJuYW1lIjoiRXhhbXBsZSBJbmR1c3RyeSBHcm91cCIsInVybCI6Imh0dHBzOi8v
ZXhhbXBsZS5jb20iLCJkZXNjcmlwdGlvbiI6IkV4YW1wbGUgSW5kdXN0cnkgR3JvdXAgaXMgYSBjb25z
b3J0aXVtIG9mIGx1bWluYXJpZXMgd2hvIHB1Ymxpc2ggc2tpbGxzIGRhdGEgZm9yIGNvbW1vbiB1c2Fn
ZS4iLCJlbWFpbCI6ImluZm9AZXhhbW1wbGUuY29tIn0sImNyaXRlcmlhIjp7Im5hcnJhdGl2ZSI6Ikxl
YXJuZXJzIG11c3QgZGVtb25zdHJhdGUgdW5kZXJzdGFuZGluZyBvZiBsaW5lYXIgYWxnZWJyYSBhbmQg
Z3JhcGhpYyByZXByZXNlbnRhdGlvbiBvZiBsaW5lYXIgZXF1YXRpb25zLiJ9LCJkZXNjcmlwdGlvbiI6
IlRoaXMgYWNoaWV2ZW1lbnQgcmVwcmVzZW50cyBkZXZlbG9waW5nIGNhcGFiaWxpdHkgdG8gc29sdmUg
YW5kIGdyYXBoIGxpbmVhciBlcXVhdGlvbnMgYW5kIGluZXF1YWxpdGllcyIsImltYWdlIjp7ImlkIjoi
aHR0cHM6Ly9leGFtcGxlLmNvbS9hY2hpZXZlbWVudHMvbWF0aC9saW5lYXItMS9pbWFnZSIsInR5cGUi
OiJJbWFnZSIsImNhcHRpb24iOiJBIGxpbmUsIHNsb3BpbmcgdXB3YXJkIG9wdGltaXN0aWNhbGx5In0s
Im5hbWUiOiJMaW5lYXIgZXF1YXRpb25zIGFuZCBpbmVxdWFsaXRpZXMifX0sImlzc3VlciI6eyJpZCI6
Imh0dHBzOi8vMWVkdGVjaC5lZHUvaXNzdWVycy81NjUwNDkiLCJ0eXBlIjpbIlByb2ZpbGUiXSwibmFt
ZSI6IjFFZFRlY2ggVW5pdmVyc2l0eSIsInVybCI6Imh0dHBzOi8vMWVkdGVjaC5lZHUiLCJwaG9uZSI6
IjEtMjIyLTMzMy00NDQ0IiwiZGVzY3JpcHRpb24iOiIxRWRUZWNoIFVuaXZlcnNpdHkgcHJvdmlkZXMg
b25saW5lIGRlZ3JlZSBwcm9ncmFtcy4iLCJpbWFnZSI6eyJpZCI6Imh0dHBzOi8vMWVkdGVjaC5lZHUv
bG9nby5wbmciLCJ0eXBlIjoiSW1hZ2UiLCJjYXB0aW9uIjoiMUVkVGVjaCBVbml2ZXJzaXR5IGxvZ28i
fSwiZW1haWwiOiJyZWdpc3RyYXJAMWVkdGVjaC5lZHUifSwidmFsaWRGcm9tIjoiMjAyMi0wNy0wMVQw
MDowMDowMFoiLCJjcmVkZW50aWFsU2NoZW1hIjpbeyJpZCI6Imh0dHBzOi8vcHVybC5pbXNnbG9iYWwu
b3JnL3NwZWMvb2IvdjNwMC9zY2hlbWEvanNvbi9vYl92M3AwX2FjaGlldmVtZW50Y3JlZGVudGlhbF9z
Y2hlbWEuanNvbiIsInR5cGUiOiIxRWRUZWNoSnNvblNjaGVtYVZhbGlkYXRvcjIwMTkifV0sImlzcyI6
Imh0dHBzOi8vMWVkdGVjaC5lZHUvaXNzdWVycy81NjUwNDkiLCJqdGkiOiJodHRwOi8vMWVkdGVjaC5l
ZHUvY3JlZGVudGlhbHMvMzczMiIsInN1YiI6ImRpZDpleGFtcGxlOmViZmViMWY3MTJlYmM2ZjFjMjc2
ZTEyZWMyMSJ9.Cm-wKmnqKprJA9KaMW40IzsJyR34U6_SBvlOZIdnHaJwHOxlGoqeBF0SnRUPwLzmznv
BamGgZXWjvudDzRVkqaX43Ye4M-oKPBueFQ2kXH1lWaReBf45Wecd5VYoWN6FZwbYSnDWMdlz1oJOpm0
sbAu01ReomirCGD1EktNUvrXPn1RaUp-l-7KWxEeTbLtEXG-7PzlDmPTsKuLb9cWf9XYHj_ENJpJKi-V
G3G526YoLvC0RYH-YprMe5d2seeU8YSNHmuRnhxIjonhS5FLDPNer1Yt2lWK666FtQCj-BzHReFI5aLO
RbgRl6mQ7hweyCKQ47fvAzmJKhx5_UQetaQ
