9. Verification and Validation

Verification is the process to determine whether a verifiable credential or verifiable presentation is an authentic and timely statement of the issuer or presenter respectively. This includes checking that: the credential (or presentation) conforms to the specification; the proof method is satisfied; and, if present, the status check succeeds. Verification of a credential does not imply evaluation of the truth of claims encoded in the credential.

Validation is the process of assuring the verifiable credential or verifiable presentation meets the needs of the verifier and other dependent stakeholders. Validating verifiable credentials or verifiable presentations is outside the scope of this specification.
Note
The 1EdTech Validator performs verification as described here.
9.1 OpenBadgeCredential Verification

This section applies to Verifiable Credentials with a type of "OpenBadgeCredential" or "AchievementCredential".

    Check that the OpenBadgeCredential conforms to the specification:
        If the OpenBadgeCredential has a credentialSchema property, and the type of the CredentialSchema object is "1EdTechJsonSchemaValidator2019", check that the credential conforms to JSON Schema as shown in 1EdTech JSON Schema Validator 2019. If it does not, the credential does not conform to the specification.
        Check that the credentialSubject is identified by an id and/or an identifier. If neither is present, the credential does not conform to the specification.
    Note
    OpenBadgeCredentials created following Verifiable Credentials Data Model v2.0 ([VC-DATA-MODEL]) have different names for attributes used in this process. Concretely, they have issuanceDate and expirationDate instead of validFrom and validUntil, respectively. The data model of these credentials and their corresponding JSON schemas, are described at § B.9 Verification Support Data Models and § E.2.1 Open Badges JSON Schema, respectively.

    Check that the proof method is satisfied:
        If the OpenBadgeCredential is signed using the § 8.2 JSON Web Token Proof Format (VC-JWT), verify the signature as shown in § 8.2.6 Verify a Credential. If the OpenBadgeCredential is signed using an embedded proof, verify the signature as shown in § 8.3.2 Verify an OpenBadgeCredential Linked Data Signature. If the signature cannot be verified, the proof method is not satisfied.
    Note
    The OpenBadgeCredential may have a VC-JWT proof and one or more Linked Data proofs. In this case, the Linked Data proofs will be attached to the OpenBadgeCredential in the signed JWT Payload. You may accept any one proof for verification. You do not need to verify all the signatures.

    Refresh the OpenBadgeCredential:
    Note
    Refresh must be completed after checking the proof so that the verifier is not spoofed into receiving a refreshed OpenBadgeCredential from a bad actor.
        If the refreshService property is present, and the type of the RefreshService object is "1EdTechCredentialRefresh", refresh the OpenBadgeCredential as shown in 1EdTech Credential Refresh Service and then repeat steps 1 and 2. If the refresh is not successful, continue the verification process using the original OpenBadgeCredential.
        Note
        Only perform Refresh once. That is, do not complete Refresh a second time even if the refreshed OpenBadgeCredential also has a refreshService defined.

    Check the status:
        A Credential is revoked if the credentialStatus property is present, and the type of the CredentialStatus object is "BitstringStatusListEntry", and if the Credential has been revoked as shown in Bitstring Status List v1.0.
        If the current date and time is before the validFrom, the OpenBadgeCredential is not yet valid.
        If the current date and time is after the validUntil, the OpenBadgeCredential is expired.
    Note
    OpenBadgeCredentials created following Verifiable Credentials Data Model v2.0 ([VC-DATA-MODEL]) have different names for attributes used in this process. Concretely, they have issuanceDate and expirationDate instead of validFrom and validUntil, respectively. The data model of these credentials and their corresponding JSON schemas, are described at § B.9 Verification Support Data Models and § E.2.1 Open Badges JSON Schema, respectively.

    Optionally verify the subject (recipient):
    Note
    This step is optional, but RECOMMENDED when the OpenBadgeCredential has been exchanged with the verifier as one of the § 5. Open Badges Document Formats.
        An OpenBadgeCredential is about a person called the recipient. The recipient is identified in the credentialSubject (see AchievementSubject) by id and/or one or more identifier (see IdentityObject). The id or identifier value to use for verification must be shared with the verifier in an out-of-band process such as by email. This is called the known value.
        To verify the recipient using a known id, simply compare the known value with the id in the ClrSubject. If they are equal then the recipient is verified.
        To verify the recipient using a known identifier such as email address follow these steps shown in § 9.3 Verify the Recipient Using an Identifier. If you find a match then the recipient is verified.
        If no match is found, the recipient is not verified.

    Verify EndorsementCredentials:
        If the OpenBadgeCredential contains any EndorsementCredentials, verify the EndorsementCredentials as shown in § 9.2 EndorsementCredential Verification.

If all the above steps pass, the OpenBadgeCredential may be treated as verified.
9.2 EndorsementCredential Verification

This section applies to Verifiable Credentials with a type of "EndorsementCredential".

    Check that the EndorsementCredential conforms to the specification:
        If the credential has a credentialSchema property, and the type of the CredentialSchema object is "1EdTechJsonSchemaValidator2019", check that the credential conforms to JSON Schema as shown in 1EdTech JSON Schema Validator 2019. If it does not, the credential does not conform to the specification.
    Note
    EndorsementCredentials created following [VC-DATA-MODEL] have different names for attributes used in this process. Concretely, they have issuanceDate and expirationDate instead of validFrom and validUntil, respectively. The data model of these credentials and their corresponding JSON schemas, are described at § B.9 Verification Support Data Models and § E.2.1 Open Badges JSON Schema, respectively.

    Check that the proof method is satisfied:
        If the EndorsementCredential is signed using the § 8.2 JSON Web Token Proof Format (VC-JWT), verify the signature as shown in § 8.2.6 Verify a Credential. If the EndorsementCredential is signed using an embedded proof, verify the signature as shown in § 8.3.2 Verify an OpenBadgeCredential Linked Data Signature. If the signature cannot be verified, the proof method is not satisfied.
        Note
        The EndorsementCredential may have a VC-JWT proof and one or more Linked Data proofs. In this case, the Linked Data proofs will be attached to the EndorsementCredential in the appropriate claim of the signed JWT Payload. You may accept any one proof for verification. You do not need to verify all the signatures.

    Refresh the EndorsementCredential:
        If the refreshService property is present, and the type of the RefreshService object is "1EdTechCredentialRefresh", refresh the EndorsementCredential as shown in 1EdTech Credential Refresh Service and then repeat steps 1 and 2. If the refresh is not successful, continue the verification process using the original EndorsementCredential.
        Note
        Refresh must be completed after checking the proof so that the verifier is not spoofed into receiving a refreshed EndorsementCredential from a bad actor.
        Note
        Only perform Refresh once. That is, do not complete Refresh a second time even if the refreshed EndorsementCredential also has a refreshService defined.

    Check the status:
        If the credentialStatus property is present, and the type of the CredentialStatus object is "BitstringStatusListEntry", and determine if the EndorsementCredential has been revoked as shown in Bitstring Status List v1.0.
        If the current date and time is before the validFrom, the EndorsementCredential is not yet valid.
        If the current date and time is after the validUntil, the EndorsementCredential is expired.
    Note
    EndorsementCredentials created following [VC-DATA-MODEL] have different names for attributes used in this process. Concretely, they have issuanceDate and expirationDate instead of validFrom and validUntil, respectively. The data model of these credentials and their corresponding JSON schemas, are described at § B.9 Verification Support Data Models and § E.2.1 Open Badges JSON Schema, respectively.

If all the above steps pass, the EndorsementCredential may be treated as verified.
9.3 Verify the Recipient Using an Identifier

The known identifier MUST be a plaintext string value. The known identifier type MUST be one of the types in IdentifierTypeEnum or an extension type. For example, if the known identifier is an email address, the known identifier type is emailAddress.

The ClrCredential issuer may include multiple identifiers that can be used for verification. The verifier should compare the known identifier (e.g. known email address) with all the identifiers included by the issuer until a match is found.

    If identifier.identityType does not match the known identifier type, skip to the next identifier.
    If identifier.hashed is true, calculate the known identifier IdentityHash using the known identifier and the identifier.salt. If the known identifier IdentityHash matches the identifier.identityHash, the recipient is verified.
    If identifier.hashed is false, and if the known identifier matches the identifier.identityHash, the recipient is verified.
