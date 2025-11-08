B. Data Models
B.1 Credential Data Models

The data models in this section are shared by Open Badges Specification v3.0 and Comprehensive Learner Record Standard v2.0.
B.1.1 Achievement

A collection of information about the accomplishment recognized by the Assertion. Many assertions may be created corresponding to one Achievement.
Property Type Description Multiplicity
id URI Unique URI for the Achievement. [1]
type IRI The type MUST include the IRI 'Achievement'. [1..*]
alignment Alignment An object describing which objectives or educational standards this achievement aligns to, if any. [0..*]
achievementType AchievementType Enumeration The type of achievement. This is an extensible vocabulary. [0..1]
creator Profile The person or organization that created the achievement definition. [0..1]
creditsAvailable Float Credit hours associated with this entity, or credit hours possible. For example 3.0. [0..1]
criteria Criteria Criteria describing how to earn the achievement. [1]
description String A short description of the achievement. [1]
endorsement EndorsementCredential Allows endorsers to make specific claims about the Achievement. These endorsements are signed with a Data Integrity proof format. [0..*]
endorsementJwt CompactJws Allows endorsers to make specific claims about the Achievement. These endorsements are signed with the VC-JWT proof format. [0..*]
fieldOfStudy String Category, subject, area of study, discipline, or general branch of knowledge. Examples include Business, Education, Psychology, and Technology. [0..1]
humanCode String The code, generally human readable, associated with an achievement. [0..1]
image Image An image representing the achievement. [0..1]
inLanguage LanguageCode The language of the achievement. [0..1]
name String The name of the achievement. [1]
otherIdentifier IdentifierEntry A list of identifiers for the described entity. [0..*]
related Related The related property identifies another Achievement that should be considered the same for most purposes. It is primarily intended to identify alternate language editions or previous versions of Achievements. [0..*]
resultDescription ResultDescription The set of result descriptions that may be asserted as results with this achievement. [0..*]
specialization String Name given to the focus, concentration, or specific area of study defined in the achievement. Examples include 'Entrepreneurship', 'Technical Communication', and 'Finance'. [0..1]
tag String One or more short, human-friendly, searchable, keywords that describe the type of achievement. [0..*]
version String The version property allows issuers to set a version string for an Achievement. This is particularly useful when replacing a previous version with an update. [0..1]
This class can be extended with additional properties.
B.1.2 AchievementCredential

AchievementCredentials are representations of an awarded achievement, used to share information about a achievement belonging to one earner. Maps to a Verifiable Credential as defined in the [VC-DATA-MODEL-2.0]. As described in § 8. Proofs (Signatures), at least one proof mechanism, and the details necessary to evaluate that proof, MUST be expressed for a credential to be a verifiable credential. In the case of an embedded proof, the credential MUST append the proof in the proof property.
Property Type Description Multiplicity
@context Context The value of the @context property MUST be an ordered set where the first item is a URI with the value 'https://www.w3.org/ns/credentials/v2', and the second item is a URI with the value 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'. [2..*]
id URI Unambiguous reference to the credential. [1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the URI 'VerifiableCredential', and one of the items MUST be the URI 'AchievementCredential' or the URI 'OpenBadgeCredential'. [1..*]
name String The name of the credential for display purposes in wallets. For example, in a list of credentials and in detail views. [0..1]
description String The short description of the credential for display purposes in wallets. [0..1]
image Image The image representing the credential for display purposes in wallets. [0..1]
awardedDate DateTimeZ Timestamp of when the credential was awarded. validFrom is used to determine the most recent version of a Credential in conjunction with issuer and id. Consequently, the only way to update a Credental is to update the validFrom, losing the date when the Credential was originally awarded. awardedDate is meant to keep this original date. [0..1]
credentialSubject AchievementSubject The recipient of the achievement. [1]
endorsement EndorsementCredential Allows endorsers to make specific claims about the credential, and the achievement and profiles in the credential. These endorsements are signed with a Data Integrity proof format. [0..*]
endorsementJwt CompactJws Allows endorsers to make specific claims about the credential, and the achievement and profiles in the credential. These endorsements are signed with the VC-JWT proof format. [0..*]
issuer ProfileRef A description of the individual, entity, or organization that issued the credential. [1]
validFrom DateTimeZ Timestamp of when the credential becomes valid. [1]
validUntil DateTimeZ If the credential has some notion of validity period, this indicates a timestamp when a credential should no longer be considered valid. After this time, the credential should be considered invalid. [0..1]
proof Proof If present, one or more embedded cryptographic proofs that can be used to detect tampering and verify the authorship of the credential. [0..*]
credentialSchema CredentialSchema The value of the credentialSchema property MUST be one or more data schemas that provide verifiers with enough information to determine if the provided data conforms to the provided schema. [0..*]
credentialStatus CredentialStatus The information in CredentialStatus is used to discover information about the current status of a verifiable credential, such as whether it is suspended or revoked. [0..1]
refreshService RefreshService The information in RefreshService is used to refresh the verifiable credential. [0..1]
termsOfUse TermsOfUse The value of the termsOfUse property tells the verifier what actions it is required to perform (an obligation), not allowed to perform (a prohibition), or allowed to perform (a permission) if it is to accept the verifiable credential. [0..*]
evidence Evidence A description of the work that the recipient did to earn the credential. This can be a page that links out to other pages if linking directly to the work is infeasible. [0..*]
This class can be extended with additional properties.
B.1.3 AchievementSubject

A collection of information about the recipient of an achievement. Maps to Credential Subject in [VC-DATA-MODEL-2.0].
Property Type Description Multiplicity
id URI An identifier for the Credential Subject. Either id or at least one identifier MUST be supplied. [0..1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the IRI 'AchievementSubject'. [1..*]
activityEndDate DateTime The datetime the activity ended. [0..1]
activityStartDate DateTime The datetime the activity started. [0..1]
creditsEarned Float The number of credits earned, generally in semester or quarter credit hours. This field correlates with the Achievement creditsAvailable field. [0..1]
achievement Achievement The achievement being awarded. [1]
identifier IdentityObject Other identifiers for the recipient of the achievement. Either id or at least one identifier MUST be supplied. [0..*]
image Image An image representing this user's achievement. If present, this must be a PNG or SVG image, and should be prepared via the 'baking' instructions. An 'unbaked' image for the achievement is defined in the Achievement class and should not be duplicated here. [0..1]
licenseNumber String The license number that was issued with this credential. [0..1]
narrative Markdown A narrative that connects multiple pieces of evidence. Likely only present at this location if evidence is a multi-value array. [0..1]
result Result The set of results being asserted. [0..*]
role String Role, position, or title of the learner when demonstrating or performing the achievement or evidence of learning being asserted. Examples include 'Student President', 'Intern', 'Captain', etc. [0..1]
source Profile The person, organization, or system that assessed the achievement on behalf of the issuer. For example, a school may assess the achievement, while the school district issues the credential. [0..1]
term String The academic term in which this assertion was achieved. [0..1]
This class can be extended with additional properties.
B.1.4 Address

An address for the described entity.
Property Type Description Multiplicity
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the IRI 'Address'. [1..*]
addressCountry String A country. [0..1]
addressCountryCode CountryCode A country code. The value must be a ISO 3166-1 alpha-2 country code [ISO3166-1]. [0..1]
addressRegion String A region within the country. [0..1]
addressLocality String A locality within the region. [0..1]
streetAddress String A street address within the locality. [0..1]
postOfficeBoxNumber String A post office box number for PO box addresses. [0..1]
postalCode String A postal code. [0..1]
geo GeoCoordinates The geographic coordinates of the location. [0..1]
This class can be extended with additional properties.
B.1.5 Alignment

Describes an alignment between an achievement and a node in an educational framework.
Property Type Description Multiplicity
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the IRI 'Alignment'. [1..*]
targetCode String If applicable, a locally unique string identifier that identifies the alignment target within its framework and/or targetUrl. [0..1]
targetDescription String Short description of the alignment target. [0..1]
targetName String Name of the alignment. [1]
targetFramework String Name of the framework the alignment target. [0..1]
targetType AlignmentTargetType Enumeration The type of the alignment target node. [0..1]
targetUrl URL URL linking to the official description of the alignment target, for example an individual standard within an educational framework. [1]
This class can be extended with additional properties.
B.1.6 Criteria

Descriptive metadata about the achievements necessary to be recognized with an assertion of a particular achievement. This data is added to the Achievement class so that it may be rendered when the achievement assertion is displayed, instead of simply a link to human-readable criteria external to the achievement. Embedding criteria allows either enhancement of an external criteria page or increased portability and ease of use by allowing issuers to skip hosting the formerly-required external criteria page altogether. Criteria is used to allow would-be recipients to learn what is required of them to be recognized with an assertion of a particular achievement. It is also used after the assertion is awarded to a recipient to let those inspecting earned achievements know the general requirements that the recipients met in order to earn it.
Property Type Description Multiplicity
id URI The URI of a webpage that describes in a human-readable format the criteria for the achievement. [0..1]
narrative Markdown A narrative of what is needed to earn the achievement. Markdown is allowed. [0..1]
This class can be extended with additional properties.
B.1.7 EndorsementCredential

A verifiable credential that asserts a claim about an entity. As described in § 8. Proofs (Signatures), at least one proof mechanism, and the details necessary to evaluate that proof, MUST be expressed for a credential to be a verifiable credential. In the case of an embedded proof, the credential MUST append the proof in the proof property.
Property Type Description Multiplicity
@context Context The value of the @context property MUST be an ordered set where the first item is a URI with the value 'https://www.w3.org/ns/credentials/v2', and the second item is a URI with the value 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'. [2..*]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the URI 'VerifiableCredential', and one of the items MUST be the URI 'EndorsementCredential'. [1..*]
id URI Unambiguous reference to the credential. [1]
name String The name of the credential for display purposes in wallets. For example, in a list of credentials and in detail views. [1]
description String The short description of the credential for display purposes in wallets. [0..1]
credentialSubject EndorsementSubject The individual, entity, organization, assertion, or achievement that is endorsed and the endorsement comment. [1]
awardedDate DateTimeZ Timestamp of when the credential was awarded. validFrom is used to determine the most recent version of a Credential in conjunction with issuer and id. Consequently, the only way to update a Credental is to update the validFrom, losing the date when the Credential was originally awarded. awardedDate is meant to keep this original date. [0..1]
issuer ProfileRef A description of the individual, entity, or organization that issued the credential. [1]
validFrom DateTimeZ Timestamp of when the credential becomes valid. [1]
validUntil DateTimeZ If the credential has some notion of validity period, this indicates a timestamp when a credential should no longer be considered valid. After this time, the credential should be considered invalid. [0..1]
proof Proof If present, one or more embedded cryptographic proofs that can be used to detect tampering and verify the authorship of the credential. [0..*]
credentialSchema CredentialSchema The value of the credentialSchema property MUST be one or more data schemas that provide verifiers with enough information to determine if the provided data conforms to the provided schema. [0..*]
credentialStatus CredentialStatus The information in CredentialStatus is used to discover information about the current status of a verifiable credential, such as whether it is suspended or revoked. [0..1]
refreshService RefreshService The information in RefreshService is used to refresh the verifiable credential. [0..1]
termsOfUse TermsOfUse The value of the termsOfUse property tells the verifier what actions it is required to perform (an obligation), not allowed to perform (a prohibition), or allowed to perform (a permission) if it is to accept the verifiable credential. [0..*]
evidence Evidence A description of the work that the recipient did to earn the credential. This can be a page that links out to other pages if linking directly to the work is infeasible. [0..*]
This class can be extended with additional properties.
B.1.8 EndorsementSubject

A collection of information about the subject of the endorsement.
Property Type Description Multiplicity
id URI The identifier of the individual, entity, organization, assertion, or achievement that is endorsed. [1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the URI 'EndorsementSubject'. [1..*]
endorsementComment Markdown Allows endorsers to make a simple claim in writing about the entity. [0..1]
This class can be extended with additional properties.
B.1.9 Evidence

Descriptive metadata about evidence related to the achievement assertion. Each instance of the evidence class present in an assertion corresponds to one entity, though a single entry can describe a set of items collectively. There may be multiple evidence entries referenced from an assertion. The narrative property is also in scope of the assertion class to provide an overall description of the achievement related to the assertion in rich text. It is used here to provide a narrative of achievement of the specific entity described. If both the description and narrative properties are present, displayers can assume the narrative value goes into more detail and is not simply a recapitulation of description.
Property Type Description Multiplicity
id URI The URL of a webpage presenting evidence of achievement or the evidence encoded as a Data URI. The schema of the webpage is undefined. [0..1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the IRI 'Evidence'. [1..*]
narrative Markdown A narrative that describes the evidence and process of achievement that led to an assertion. [0..1]
name String A descriptive title of the evidence. [0..1]
description String A longer description of the evidence. [0..1]
genre String A string that describes the type of evidence. For example, Poetry, Prose, Film. [0..1]
audience String A description of the intended audience for a piece of evidence. [0..1]
This class can be extended with additional properties.
B.1.10 GeoCoordinates

The geographic coordinates of a location.
Property Type Description Multiplicity
type IRI MUST be the IRI 'GeoCoordinates'. [1]
latitude Float The latitude of the location [WGS84]. [1]
longitude Float The longitude of the location [WGS84]. [1]
This class can be extended with additional properties.
B.1.11 IdentifierEntry

Property Type Description Multiplicity
type IRI MUST be the IRI 'IdentifierEntry'. [1]
identifier Identifier An identifier. [1]
identifierType IdentifierTypeEnum Enumeration The identifier type. [1]
B.1.12 IdentityObject

A collection of information about the recipient of an achievement.
Property Type Description Multiplicity
type IRI MUST be the IRI 'IdentityObject'. [1]
hashed Boolean Whether or not the identityHash value is hashed. [1]
identityHash IdentityHash Either the IdentityHash of the identity or the plaintext value. If it's possible that the plaintext transmission and storage of the identity value would leak personally identifiable information where there is an expectation of privacy, it is strongly recommended that an IdentityHash be used. [1]
identityType IdentifierTypeEnum Enumeration The identity type. [1]
salt String If the identityHash is hashed, this should contain the string used to salt the hash. If this value is not provided, it should be assumed that the hash was not salted. [0..1]
B.1.13 Image

Metadata about images that represent assertions, achieve or profiles. These properties can typically be represented as just the id string of the image, but using a fleshed-out document allows for including captions and other applicable metadata.
Property Type Description Multiplicity
id URI The URI or Data URI of the image. [1]
type IRI MUST be the IRI 'Image'. [1]
caption String The caption for the image. [0..1]
B.1.14 Profile

A Profile is a collection of information that describes the entity or organization using Open Badges. Issuers must be represented as Profiles, and endorsers, or other entities may also be represented using this vocabulary. Each Profile that represents an Issuer may be referenced in many BadgeClasses that it has defined. Anyone can create and host an Issuer file to start issuing Open Badges. Issuers may also serve as recipients of Open Badges, often identified within an Assertion by specific properties, like their url or contact email address.
Property Type Description Multiplicity
id URI Unique URI for the Issuer/Profile file. [1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the IRI 'Profile'. [1..*]
name String The name of the entity or organization. [0..1]
url URI The homepage or social media profile of the entity, whether individual or institutional. Should be a URL/URI Accessible via HTTP. [0..1]
phone PhoneNumber [0..1]
description String A short description of the issuer entity or organization. [0..1]
endorsement EndorsementCredential Allows endorsers to make specific claims about the individual or organization represented by this profile. These endorsements are signed with a Data Integrity proof format. [0..*]
endorsementJwt CompactJws Allows endorsers to make specific claims about the individual or organization represented by this profile. These endorsements are signed with the VC-JWT proof format. [0..*]
image Image An image representing the issuer. This must be a PNG or SVG image. [0..1]
email EmailAddress An email address. [0..1]
address Address An address for the individual or organization. [0..1]
otherIdentifier IdentifierEntry A list of identifiers for the described entity. [0..*]
official String If the entity is an organization, official is the name of an authorized official of the organization. [0..1]
parentOrg Profile The parent organization of the entity. [0..1]
familyName String Family name. In the western world, often referred to as the 'last name' of a person. [0..1]
givenName String Given name. In the western world, often referred to as the 'first name' of a person. [0..1]
additionalName String Additional name. Includes what is often referred to as 'middle name' in the western world. [0..1]
patronymicName String Patronymic name. [0..1]
honorificPrefix String Honorific prefix(es) preceding a person's name (e.g. 'Dr', 'Mrs' or 'Mr'). [0..1]
honorificSuffix String Honorific suffix(es) following a person's name (e.g. 'M.D, PhD'). [0..1]
familyNamePrefix String Family name prefix. As used in some locales, this is the leading part of a family name (e.g. 'de' in the name 'de Boer'). [0..1]
dateOfBirth Date Birthdate of the person. [0..1]
This class can be extended with additional properties.
B.1.15 Related

Identifies a related achievement.
Property Type Description Multiplicity
id URI The related achievement. [1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the IRI 'Related'. [1..*]
inLanguage LanguageCode The language of the related achievement. [0..1]
version String The version of the related achievement. [0..1]
This class can be extended with additional properties.
B.1.16 Result

Describes a result that was achieved.
Property Type Description Multiplicity
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the IRI 'Result'. [1..*]
achievedLevel URI If the result represents an achieved rubric criterion level (e.g. Mastered), the value is the id of the RubricCriterionLevel in linked ResultDescription. [0..1]
alignment Alignment The alignments between this result and nodes in external frameworks. This set of alignments are in addition to the set of alignments defined in the corresponding ResultDescription object. [0..*]
resultDescription URI An achievement can have many result descriptions describing possible results. The value of resultDescription is the id of the result description linked to this result. The linked result description must be in the achievement that is being asserted. [0..1]
status ResultStatusType Enumeration The status of the achievement. Required if resultType of the linked ResultDescription is Status. [0..1]
value String A string representing the result of the performance, or demonstration, of the achievement. For example, 'A' if the recipient received an A grade in class. [0..1]
This class can be extended with additional properties.
B.1.17 ResultDescription

Describes a possible achievement result.
Property Type Description Multiplicity
id URI The unique URI for this result description. Required so a result can link to this result description. [1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the IRI 'ResultDescription'. [1..*]
alignment Alignment Alignments between this result description and nodes in external frameworks. [0..*]
allowedValue String An ordered list of allowed values. The values should be ordered from low to high as determined by the achievement creator. [0..*]
name String The name of the result. [1]
requiredLevel URI The id of the rubric criterion level required to pass as determined by the achievement creator. [0..1]
requiredValue String A value from allowedValue or within the range of valueMin to valueMax required to pass as determined by the achievement creator. [0..1]
resultType ResultType Enumeration The type of result this description represents. This is an extensible enumerated vocabulary. [1]
rubricCriterionLevel RubricCriterionLevel An ordered array of rubric criterion levels that may be asserted in the linked result. The levels should be ordered from low to high as determined by the achievement creator. [0..*]
valueMax String The maximum possible value that may be asserted in a linked result. [0..1]
valueMin String The minimum possible value that may be asserted in a linked result. [0..1]
This class can be extended with additional properties.
B.1.18 RubricCriterionLevel

Describes a rubric criterion level.
Property Type Description Multiplicity
id URI The unique URI for this rubric criterion level. Required so a result can link to this rubric criterion level. [1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the IRI 'RubricCriterionLevel'. [1..*]
alignment Alignment Alignments between this rubric criterion level and a rubric criterion levels defined in external frameworks. [0..*]
description String Description of the rubric criterion level. [0..1]
level String The rubric performance level in terms of success. [0..1]
name String The name of the rubric criterion level. [1]
points String The points associated with this rubric criterion level. [0..1]
This class can be extended with additional properties.
B.1.19 VerifiableCredential

A Verifiable Credential as defined in the [VC-DATA-MODEL-2.0]. As described in § 8. Proofs (Signatures), at least one proof mechanism, and the details necessary to evaluate that proof, MUST be expressed for a credential to be a verifiable credential. In the case of an embedded proof, the credential MUST append the proof in the proof property.
Property Type Description Multiplicity
@context Context The value of the @context property MUST be an ordered set where the first item is a URI with the value 'https://www.w3.org/ns/credentials/v2'. [1..*]
id URI Unambiguous reference to the credential. [0..1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the URI 'VerifiableCredential'. [1..*]
issuer ProfileRef A description of the individual, entity, or organization that issued the credential. [1]
validFrom DateTimeZ Timestamp of when the credential becomes valid. [1]
validUntil DateTimeZ If the credential has some notion of validity period, this indicates a timestamp when a credential should no longer be considered valid. After this time, the credential should be considered invalid. [0..1]
credentialSubject CredentialSubject The subject of the credential. [1]
proof Proof If present, one or more embedded cryptographic proofs that can be used to detect tampering and verify the authorship of the credential. [0..*]
credentialSchema CredentialSchema The value of the credentialSchema property MUST be one or more data schemas that provide verifiers with enough information to determine if the provided data conforms to the provided schema. [0..*]
credentialStatus CredentialStatus The information in CredentialStatus is used to discover information about the current status of a verifiable credential, such as whether it is suspended or revoked. [0..1]
refreshService RefreshService The information in RefreshService is used to refresh the verifiable credential. [0..1]
termsOfUse TermsOfUse The value of the termsOfUse property tells the verifier what actions it is required to perform (an obligation), not allowed to perform (a prohibition), or allowed to perform (a permission) if it is to accept the verifiable credential. [0..*]
evidence Evidence A description of the work that the recipient did to earn the credential. This can be a page that links out to other pages if linking directly to the work is infeasible. [0..*]
This class can be extended with additional properties.
B.1.20 ProfileRef

A description of the individual, entity, or organization that issued the credential. Either a URI with the Unique URI for the Issuer/Profile file, or a Profile object MUST be supplied.

The ultimate representation of this class is a choice of exactly one of the classes in the following set:
Type Description
URI A NormalizedString that respresents a Uniform Resource Identifier (URI).
Profile A Profile is a collection of information that describes the entity or organization using Open Badges. Issuers must be represented as Profiles, and endorsers, or other entities may also be represented using this vocabulary. Each Profile that represents an Issuer may be referenced in many BadgeClasses that it has defined. Anyone can create and host an Issuer file to start issuing Open Badges. Issuers may also serve as recipients of Open Badges, often identified within an Assertion by specific properties, like their url or contact email address.
B.1.21 CredentialSchema

Identify the type and location of a data schema.
Property Type Description Multiplicity
id URI The value MUST be a URI identifying the schema file. One instance of CredentialSchema MUST have an id that is the URL of the JSON Schema for this credential defined by this specification. [1]
type IRI The value MUST identify the type of data schema validation. One instance of CredentialSchema MUST have a type of '1EdTechJsonSchemaValidator2019'. [1]
This class can be extended with additional properties.
B.1.22 CredentialStatus

The information in CredentialStatus is used to discover information about the current status of a verifiable credential, such as whether it is suspended or revoked.
Property Type Description Multiplicity
id URI The value MUST be the URL of the issuer's credential status method. [0..1]
type IRI The name of the credential status method. [1]
This class can be extended with additional properties.
B.1.23 CredentialSubject

Claims about the credential subject. Maps to Credential Subject as defined in the [VC-DATA-MODEL-2.0].
Property Type Description Multiplicity
id URI The identity of the credential subject. [0..1]
This class can be extended with additional properties.
B.1.24 Proof

A JSON-LD Linked Data proof.
Property Type Description Multiplicity
type IRI Signature suite used to produce proof. [1]
created DateTime Date the proof was created. [0..1]
cryptosuite String The suite used to create the proof. [0..1]
challenge String A value chosen by the verifier to mitigate authentication proof replay attacks. [0..1]
domain String The domain of the proof to restrict its use to a particular target. [0..1]
nonce String A value chosen by the creator of proof to randomize proof values for privacy purposes. [0..1]
proofPurpose String The purpose of the proof to be used with verificationMethod. MUST be 'assertionMethod'. [0..1]
proofValue String Value of the proof. [0..1]
verificationMethod URI The URL of the public key that can verify the signature. [0..1]
This class can be extended with additional properties.
B.1.25 RefreshService

The information in RefreshService is used to refresh the verifiable credential.
Property Type Description Multiplicity
id URI The value MUST be the URL of the issuer's refresh service. [1]
type IRI The name of the refresh service method. [1]
This class can be extended with additional properties.
B.1.26 TermsOfUse

Terms of use can be utilized by an issuer or a holder to communicate the terms under which a verifiable credential or verifiable presentation was issued
Property Type Description Multiplicity
id URI The value MUST be a URI identifying the term of use. [0..1]
type IRI The value MUST identify the type of the terms of use. [1]
This class can be extended with additional properties.
B.1.27 Context

JSON-LD Context. Either a URI with the context definition or a Map with a local context definition MUST be supplied.

The ultimate representation of this class is a choice of exactly one of the classes in the following set:
Type Description
Map A map representing an object with unknown, arbitrary properties
URI A NormalizedString that respresents a Uniform Resource Identifier (URI).
B.1.28 AchievementType Enumeration

The type of achievement, for example 'Award' or 'Certification'. This is an extensible enumerated vocabulary. Extending the vocabulary makes use of a naming convention.
Term Description
Achievement Represents a generic achievement.
ApprenticeshipCertificate Credential earned through work-based learning and earn-and-learn models that meet standards and are applicable to industry trades and professions. This is an exact match of ApprenticeshipCertificate in [CTDL-TERMS].
Assessment Direct, indirect, formative, and summative evaluation or estimation of the nature, ability, or quality of an entity, performance, or outcome of an action. This is an exact match of Assessment in [CTDL-TERMS].
Assignment Represents the result of a curricular, or co-curricular assignment or exam.
AssociateDegree College/university award for students typically completing the first one to two years of post secondary school education. Equivalent to an award at UNESCO ISCED 2011, Level 5. This is an exact match of AssociateDegree in [CTDL-TERMS].
Award Represents an award.
Badge Visual symbol containing verifiable claims in accordance with the Open Badges specification and delivered digitally. This is an exact match of Badge in [CTDL-TERMS].
BachelorDegree College/university award for students typically completing three to five years of education where course work and activities advance skills beyond those of the first one to two years of college/university study. Equivalent to an award at UNESCO ISCED 2011, Level 6. Use for 5-year cooperative (work-study) programs. A cooperative plan provides for alternate class attendance and employment in business, industry, or government; thus, it allows students to combine actual work experience with their college studies. Also includes bachelor's degrees in which the normal 4 years of work are completed in 3 years. This is an exact match of BachelorDegree in [CTDL-TERMS].
Certificate Credential that designates requisite knowledge and skills of an occupation, profession, or academic program. This is an exact match of Certificate in [CTDL-TERMS].
CertificateOfCompletion Credential that acknowledges completion of an assignment, training or other activity. A record of the activity may or may not exist, and the credential may or may not be designed as preparation for another resource such as a credential, assessment, or learning opportunity. This is an exact match of CertificateOfCompletion in [CTDL-TERMS].
Certification Time-limited, revocable, renewable credential awarded by an authoritative body for demonstrating the knowledge, skills, and abilities to perform specific tasks or an occupation. Certifications can typically be revoked if not renewed, for a violation of a code of ethics (if applicable) or proven incompetence after due process. Description of revocation criteria for a specific Certification should be defined using Revocation Profile. This is an exact match of Certification in [CTDL-TERMS].
CommunityService Represents community service.
Competency Measurable or observable knowledge, skill, or ability necessary to successful performance of a person. This is an exact match of Competency in [CTDL-ASN-TERMS].
Course Represents a course completion.
CoCurricular Represents a co-curricular activity.
Degree Academic credential conferred upon completion of a program or course of study, typically over multiple years at a college or university. This is an exact match of Degree in [CTDL-TERMS].
Diploma Credential awarded by educational institutions for successful completion of a course of study or its equivalent. This is an exact match of Diploma in [CTDL-TERMS].
DoctoralDegree Highest credential award for students who have completed both a bachelor's degree and a master's degree or their equivalent as well as independent research and/or a significant project or paper. Equivalent to UNESCO ISCED, Level 8. This is an exact match of DoctoralDegree in [CTDL-TERMS].
Fieldwork Represents practical activities that are done away school, college, or place of work. Includes internships and practicums.
GeneralEducationDevelopment (GED) Credential awarded by examination that demonstrates that an individual has acquired secondary school-level academic skills. Equivalent to a secondary school diploma, based on passing a state- or province-selected examination such as GED, HiSET, or TASC; or to an award at UNESCO ISCED 2011 Levels 2 or 3. This is an exact match of GeneralEducationDevelopment in [CTDL-TERMS].
JourneymanCertificate Credential awarded to skilled workers on successful completion of an apprenticeship in industry trades and professions. This is an exact match of JourneymanCertificate in [CTDL-TERMS].
LearningProgram Set of learning opportunities that leads to an outcome, usually a credential like a degree or certificate. This is an exact match of LearningProgram in [CTDL-TERMS].
License Credential awarded by a government agency or other authorized organization that constitutes legal authority to do a specific job and/or utilize a specific item, system or infrastructure and are typically earned through some combination of degree or certificate attainment, certifications, assessments, work experience, and/or fees, and are time-limited and must be renewed periodically. This is an exact match of License in [CTDL-TERMS].
Membership Represents membership.
ProfessionalDoctorate Doctoral degree conferred upon completion of a program providing the knowledge and skills for the recognition, credential, or license required for professional practice. Equivalent to an award at UNESCO ISCED 2011, Level 8. This is an exact match of ProfessionalDoctorate in [CTDL-TERMS].
QualityAssuranceCredential Credential assuring that an organization, program, or awarded credential meets prescribed requirements and may include development and administration of qualifying examinations. This is an exact match of QualityAssuranceCredential in [CTDL-TERMS].
MasterCertificate Credential awarded upon demonstration through apprenticeship of the highest level of skills and performance in industry trades and professions. This is an exact match of MasterCertificate in [CTDL-TERMS].
MasterDegree Credential awarded for a graduate level course of study where course work and activities advance skills beyond those of the bachelor's degree or its equivalent. Equivalent to an award at UNESCO ISCED 2011, Level 7. This is an exact match of MasterDegree in [CTDL-TERMS].
MicroCredential Credential that addresses a subset of field-specific knowledge, skills, or competencies; often developmental with relationships to other micro-credentials and field credentials. This is an exact match of MicroCredential in [CTDL-TERMS].
ResearchDoctorate Doctoral degree conferred for advanced work beyond the master level, including the preparation and defense of a thesis or dissertation based on original research, or the planning and execution of an original project demonstrating substantial artistic or scholarly achievement. Equivalent to an award at UNESCO ISCED 2011, Level 8. This is an exact match of ResearchDoctorate in [CTDL-TERMS].
SecondarySchoolDiploma Diploma awarded by secondary education institutions for successful completion of a secondary school program of study. Equivalent to an award at UNESCO ISCED 2011 Levels 2 or 3. This is an exact match of SecondarySchoolDiploma in [CTDL-TERMS].
This enumeration can be extended with new, proprietary terms. The new terms must start with the substring 'ext:'.
B.1.29 AlignmentTargetType Enumeration

The type of the alignment target node in the target framework.
Term Description
ceasn:Competency An alignment to a CTDL-ASN/CTDL competency published by Credential Engine.
ceterms:Credential An alignment to a CTDL Credential published by Credential Engine.
CFItem An alignment to a CASE Framework Item.
CFRubric An alignment to a CASE Framework Rubric.
CFRubricCriterion An alignment to a CASE Framework Rubric Criterion.
CFRubricCriterionLevel An alignment to a CASE Framework Rubric Criterion Level.
CTDL An alignment to a Credential Engine Item.
This enumeration can be extended with new, proprietary terms. The new terms must start with the substring 'ext:'.
B.1.30 IdentifierTypeEnum Enumeration

Term Description
name
sourcedId
systemId
productId
userName
accountId
emailAddress
nationalIdentityNumber
isbn
issn
lisSourcedId
oneRosterSourcedId
sisSourcedId
ltiContextId
ltiDeploymentId
ltiToolId
ltiPlatformId
ltiUserId
identifier
This enumeration can be extended with new, proprietary terms. The new terms must start with the substring 'ext:'.
B.1.31 ResultType Enumeration

The type of result. This is an extensible enumerated vocabulary. Extending the vocabulary makes use of a naming convention.
Term Description
GradePointAverage The result is a grade point average.
LetterGrade The result is a letter grade.
Percent The result is a percent score.
PerformanceLevel The result is a performance level.
PredictedScore The result is a predicted score.
RawScore The result is a raw score.
Result A generic result.
RubricCriterion The result is from a rubric criterion.
RubricCriterionLevel The result is a rubric criterion level.
RubricScore The result represents a rubric score with both a name and a numeric value.
ScaledScore The result is a scaled score.
Status The result conveys the status of the achievement.
This enumeration can be extended with new, proprietary terms. The new terms must start with the substring 'ext:'.
B.1.32 ResultStatusType Enumeration

Defined vocabulary to convey the status of an achievement.
Term Description
Completed The learner has successfully completed the achievement. This is the default status if no status result is included.
Enrolled The learner is enrolled in the activity described by the achievement.
Failed The learner has unsuccessfully completed the achievement.
InProgress The learner has started progress in the activity described by the achievement.
OnHold The learner has completed the activity described by the achievement, but successful completion has not been awarded, typically for administrative reasons.
Provisional The learner has completed the activity described by the achievement, but the completed result has not yet been confirmed.
Withdrew The learner withdrew from the activity described by the achievement before completion.
B.2 Open Badges API Data Models

The data models in this section are used by the § 6. Open Badges API.
B.2.1 GetOpenBadgeCredentialsResponse

Property Type Description Multiplicity
credential AchievementCredential OpenBadgeCredentials that have not been signed with the VC-JWT Proof Format MUST be in the credential array. [0..*]
compactJwsString CompactJws OpenBadgeCredentials that have been signed with the VC-JWT Proof Format MUST be in the compactJwsString array. [0..*]
B.3 Shared API Data Models

The data models in this section are shared by all 1EdTech service specifications.
B.3.1 Imsx_StatusInfo

This is the container for the status code and associated information returned within the HTTP messages received from the Service Provider.
Property Type Description Multiplicity
imsx_codeMajor Imsx_CodeMajor Enumeration The code major value (from the corresponding enumerated vocabulary). [1]
imsx_severity Imsx_Severity Enumeration The severity value (from the corresponding enumerated vocabulary). [1]
imsx_description String A human readable description supplied by the entity creating the status code information. [0..1]
imsx_codeMinor Imsx_CodeMinor The set of reported code minor status codes. [0..1]
B.3.2 Imsx_CodeMajor Enumeration

This is the set of primary status report values i.e. the major code assigned to the status block. This is used in conjunction with the 'Severity' structure in the status object.
Term Description
failure Denotes that the transaction request has failed. The detailed reason will be reported in the accompanying 'codeMinor' fields.
processing Denotes that the request is being processed at the destination or there has been a local transmission failure. This value is used in asynchronous services.
success Denotes that the request has been successfully completed. If the associated 'severity' value is 'warning' then the request has been partially successful i.e. best effort by the service provider. Other parts of the status information may provide more insight into a partial success response.
unsupported Denotes that the service provider does not support the requested operation. This is the required default response for an unsupported operation by an implementation.
B.3.3 Imsx_Severity Enumeration

This is the context for the status report values. This is used in conjunction with the 'CodeMajor' structure in the status object.
Term Description
error A catastrophic error has occurred in processing the request and so the request was not completed (the Service Provider may not even have received the request).
status The request has been completed and a response was received from the Service Provider.
warning The request has only been partially completed. For an asynchronous service a further response should be expected.
B.3.4 Imsx_CodeMinor

This is the container for the set of code minor status codes reported in the responses from the Service Provider.
Property Type Description Multiplicity
imsx_codeMinorField Imsx_CodeMinorField Each reported code minor status code. [1..*]
B.3.5 Imsx_CodeMinorField

This is the container for a single code minor status code.
Property Type Description Multiplicity
imsx_codeMinorFieldName NormalizedString This should contain the identity of the system that has produced the code minor status code report. [1]
imsx_codeMinorFieldValue Imsx_CodeMinorFieldValue Enumeration The code minor status code (this is a value from the corresponding enumerated vocabulary). [1]
B.3.6 Imsx_CodeMinorFieldValue Enumeration

This is the set of codeMinor status codes that are used to provide further insight into the completion status of the end-to-end transaction i.e. this should be used to provide more information than would be supplied by an HTTP code.
Term Description
forbidden This is used to indicate that the server can be reached and process the request but refuses to take any further action. This would be accompanied by the 'codeMajor/severity' values of 'failure/error' and for a REST binding a HTTP code of '403'.
fullsuccess The request has been fully and successfully implemented by the service provider. For a REST binding this will have an HTTP code of '200' for a successful search request.
internal_server_error This should be used only if there is catastrophic error and there is not a more appropriate code. This would be accompanied by the 'codeMajor/severity' values of 'failure/error' and for a REST binding a HTTP code of '500'.
invalid_data This error condition may occur if a JSON request/response body contains well-formed (i.e. syntactically correct), but semantically erroneous, JSON instructions. This would be accompanied by the 'codeMajor/severity' values of 'failure/error' and a HTTP code of '422'.
invalid_query_parameter An invalid data query parameter field was supplied and the query could not be processed. This would be accompanied by the 'codeMajor/severity' values of 'failure/error' and for a REST binding a HTTP code of '400'.
misdirected_request This is used to indicate that the request was made with a protocol that is not supported by the server. This would be accompanied by the 'codeMajor/severity' values of 'failure/error' and for a REST binding a HTTP code of '421'.
not_acceptable This is used to indicate that the server cannot provide a response with a Content-Type that matches any of the content types in the request Accept header. This would be accompanied by the 'codeMajor/severity' values of 'failure/error' and for a REST binding a HTTP code of '406'.
not_allowed This is used to indicate that the server does not allow the HTTP method. This would be accompanied by the 'codeMajor/severity' values of 'failure/error' and for a REST binding a HTTP code of '405'.
not_found This is used to indicate that the server did not find the resource. This would be accompanied by the 'codeMajor/severity' values of 'failure/status' and for a REST binding a HTTP code of '404'.
not_modified This is used to indicate that the server did not modify the resource. This would be accompanied by the 'codeMajor/severity' values of 'success/status' and for a REST binding a HTTP code of '304'.
server_busy The server is receiving too many requests. Retry at a later time. This would be accompanied by the 'codeMajor/severity' values of 'failure/error' and for a REST binding a HTTP code of '429'.
unauthorizedrequest The request was not correctly authorised. This would be accompanied by the 'codeMajor/severity' values of 'failure/error' and for a REST binding a HTTP code of '401'.
unknown Any other error occurred. This would be accompanied by the 'codeMajor/severity' values of 'failure/error' and for a REST binding a HTTP code corresponding to the error.
B.4 Shared API Security Data Models

The data models in this section are shared by all 1EdTech service specifications.
B.4.1 ServiceDescriptionDocument

The Service Description Document (SDD) is a machine readable document that contains the description of the service features supported by the Provider/Platform. The SDD is an OpenAPI 3.0 (JSON) [OPENAPIS-3.0] structured document that MUST be a profiled version of the OpenAPI 3.0 (JSON) file provided provided with this specification. This profiled version contains all of the details about the supported set of service end-points, the supported optional data fields, definitions of the proprietary data fields supplied using the permitted extension mechanisms, definitions of the available proprietary endpoints, and information about the security mechanisms.
Property Type Description Multiplicity
openapi String This string MUST be the semantic version number of the OpenAPI Specification version that the OpenAPI document uses. The openapi field SHOULD be used by tooling specifications and clients to interpret the OpenAPI document. This is not related to the API info.version string. [1]
info OpenApiInfo Information about the API and the resource server. [1]
components OpenApiComponents Holds a set of reusable objects for different aspects of the OAS. [1]
This class can be extended with additional properties.
B.4.2 OpenApiComponents

Holds a set of reusable objects for different aspects of the OAS. All objects defined within the components object will have no effect on the API unless they are explicitly referenced from properties outside the components object.
Property Type Description Multiplicity
securitySchemes OpenApiSecuritySchemes The Map of security scheme objects supported by this specification. [1]
This class can be extended with additional properties.
B.4.3 OpenApiInfo

The object provides metadata about the API. The metadata MAY be used by the clients if needed, and MAY be presented in editing or documentation generation tools for convenience.
Property Type Description Multiplicity
termsOfService URL A fully qualified URL to the resource server's terms of service. [1]
title String The name of the resource server. [1]
version String The version of the API. [1]
x-imssf-image URI An image representing the resource server. MAY be a Data URI or the URL where the image may be found. [0..1]
x-imssf-privacyPolicyUrl URL A fully qualified URL to the resource server's privacy policy. [1]
This class can be extended with additional properties.
B.4.4 OpenApiOAuth2SecurityScheme

Defines an OAuth2 security scheme that can be used by the operations.
Property Type Description Multiplicity
type String MUST be the string oauth2. [1]
description String A short description for the security scheme. [0..1]
x-imssf-registrationUrl URL A fully qualified URL to the Client Registration endpoint. [1]
This class can be extended with additional properties.
B.4.5 OpenApiSecuritySchemes

The Map of security scheme objects supported by this specification.
Property Type Description Multiplicity
OAuth2ACG OpenApiOAuth2SecurityScheme REQUIRED if the authorization server supports the Authorization Code Grant Flow. [0..1]
B.5 Shared OAuth 2.0 Data Models

The data models in this section are shared by all 1EdTech service specifications.
B.5.1 AuthorizationError Vocabulary

This is the set of ASCII error code strings that may be returned in response to a client authorization request. See Section 4.1 of [RFC6749].
Term Description
invalid_request The request is missing a required parameter, includes an invalid parameter value, includes a parameter more than once, or is otherwise malformed.
unauthorized_client The client is not authorized to request an authorization code using this method.
access_denied The resource owner or authorization server denied the request.
unsupported_response_type The authorization server does not support obtaining an authorization code using this method.
invalid_scope The requested scope is invalid, unknown, or malformed.
server_error The authorization server encountered an unexpected condition that prevented it from fulfilling the request. (This error code is needed because a 500 Internal Server Error HTTP status code cannot be returned to the client via an HTTP redirect.)
temporarily_unavailable The authorization server is currently unable to handle the request due to a temporary overloading or maintenance of the server. (This error code is needed because a 503 Service Unavailable HTTP status code cannot be returned to the client via an HTTP redirect.)
B.5.2 RegistrationError Vocabulary

This is the set of ASCII error code strings that may be returned in response to a client registration request. See [RFC7591].
Term Description
invalid_redirect_uri The value of one or more redirection URIs is invalid.
invalid_client_metadata The value of one of the client metadata fields is invalid and the server has rejected this request. Note that an authorization server MAY choose to substitute a valid value for any requested parameter of a client's metadata.
invalid_software_statement The software statement presented is invalid. This MUST only be returned if a Software Statement has been supplied in the registration request. Use of a Software Statement is NOT RECOMMENDED.
unapproved_software_statement The software statement presented is not approved for use by this authorization server. This MUST only be returned if a Software Statement has been supplied in the registration request. Use of a Software Statement is NOT RECOMMENDED.
B.5.3 TokenError Vocabulary

This is the set of ASCII error code strings that may be returned in response to a client token request. See Section 5.2 of [RFC6749].
Term Description
invalid_request The request is missing a required parameter, includes an unsupported parameter value (other than grant type), repeats a parameter, includes multiple credentials, utilizes more than one mechanism for authenticating the client, or is otherwise malformed.
invalid_client Client authentication failed (e.g., unknown client, no client authentication included, or unsupported authentication method). The authorization server MAY return an HTTP 401 (Unauthorized) status code to indicate which HTTP authentication schemes are supported. If the client attempted to authenticate via the "Authorization" request header field, the authorization server MUST respond with an HTTP 401 (Unauthorized) status code and include the "WWW-Authenticate" response header field matching the authentication scheme used by the client.
invalid_grant The provided authorization grant (e.g., authorization code, resource owner credentials) or refresh token is invalid, expired, revoked, does not match the redirection URI used in the authorization request, or was issued to another client.
unauthorized_client The authenticated client is not authorized to use this authorization grant type.
unsupported_grant_type The authorization grant type is not supported by the authorization server.
unsupported_token_type The authorization server does not support the revocation of the presented token type. That is, the client tried to revoke an access token on a server not supporting this feature.
invalid_scope The requested scope is invalid, unknown, malformed, or exceeds the scope granted by the resource owner.
B.6 Shared Proof Data Models

Data models for the JSON Web Token Proof Format (VC-JWT) [VC-DATA-MODEL-2.0] shared by Open Badges Specification v3.0 and Comprehensive Learner Record Standard v2.0.
B.6.1 Multikey

Property Type Description Multiplicity
id URI The id of the verification method MUST be the JWK thumbprint calculated from the publicKeyMultibase property value according to [MULTIBASE]. [1]
type String The type of the verification method MUST be the string DataIntegrityProof. [0..1]
cryptosuite String The cryptosuite of the verification method MUST be the string eddsa-rdf-2022. [1]
controller URI The identify of the entity that controls this public key. [0..1]
publicKeyMultibase String The publicKeyMultibase property of the verification method MUST be a public key encoded according to [MULTICODEC] and formatted according to [MULTIBASE]. The multicodec encoding of a Ed25519 public key is the two-byte prefix 0xed01 followed by the 32-byte public key data. [1]
B.6.2 JWK

A JSON Web Key (JWK) formatted according to [RFC7517].
Property Type Description Multiplicity
kty String The kty (key type) parameter identifies the cryptographic algorithm family used with the key, such as RSA or EC. [1]
use String The use (public key use) parameter identifies the intended use of the public key, such as sig (signature) or end (encryption). [0..1]
key_ops String The key_ops (key operations) parameter identifies the operation(s) for which the key is intended to be used, such as sign (compute digital signature or MAC) or verify (verify digital signature or MAC). [0..1]
alg String The alg (algorithm) parameter identifies the algorithm intended for use with the key, such as RS256 or PS256. [0..1]
kid String The kid (key ID) parameter is used to match a specific key. [0..1]
x5u URI The x5u (X.509 URL) parameter is a URI that refers to a resource for an X.509 public key certificate or certificate chain [RFC5280]. [0..1]
x5c String The x5c (X.509 certificate chain) parameter contains a chain of one or more PKIX certificates [RFC5280]. [0..*]
x5t String The x5t (X.509 certificate SHA-1 thumbprint) parameter is a base64url-encoded SHA-1 thumbprint (a.k.a. digest) of the DER encoding of an X.509 certificate [RFC5280]. [0..1]
x5t_S256 String The x5t#S256 (X.509 certificate SHA-256 thumbprint) parameter is a base64url-encoded SHA-256 thumbprint (a.k.a. digest) of the DER encoding of an X.509 certificate [RFC5280]. [0..1]
This class can be extended with additional properties.
B.6.3 JWKS

A JWK Set (JWKS) formatted according to [RFC7517].
Property Type Description Multiplicity
keys JWK A JWK Set is a JSON object that represents a set of JWKs. [1..*]
B.7 Derived Types

The derived types in this section are shared by all 1EdTech specifications.
Type Description
ASCIIString An ASCII [RFC20] string. The string MUST NOT include characters outside the set %x20-21 / %x23-5B / %x5D-7E.
BaseTerm A term in an enumeration which serves as a common term for all other entries in this enumeration, and as such is less specific. The lexical constraints are the same as for Term.
CompactJws A String in Compact JWS format [RFC7515].
CountryCode A two-digit ISO 3166-1 alpha-2 country code [ISO3166-1].
DateTimeZ A DateTime with the trailing timezone specifier included, e.g. 2021-09-07T02:09:59+02:00
EmailAddress A NormalizedString representing an email address.
Identifier A NormalizedString that functions as an identifier.
IdentityHash A String consisting of an algorithm identifier, a $ separator, and a hash across an identifier and an optionally appended salt string. The only supported algorithms are MD5 [RFC1321] and SHA-256 [FIPS-180-4], identified by the strings 'md5' and 'sha256' respectively. Identifiers and salts MUST be encoded in UTF-8 prior to hashing, and the resulting hash MUST be expressed in hexadecimal using uppercase (A-F, 0-9) or lowercase character (a-f, 0-9) sets. For example: 'sha256$b5809d8a92f8858436d7e6b87c12ebc0ae1eac4baecc2c0b913aee2c922ef399' represents the result of calculating a SHA-256 hash on the string 'a@example.comKosher'. in which the email identifier 'a@example.com' is salted with 'Kosher'
IRI A NormalizedString that represents an Internationalized Resource Identifier (IRI), which extends the ASCII characters subset of the Uniform Resource Identifier (URI).
LanguageCode A language code [BCP47].
Markdown A String that may contain Markdown.
NumericDate An Integer representing the number of seconds from from 1970-01-01T00:00:00Z UTC until the specified UTC data/time, ignoring leap seconds.
PhoneNumber A NormalizedString representing a phone number.
Term A term in an enumeration. The lexical constraints are the same as for Token.
URI A NormalizedString that respresents a Uniform Resource Identifier (URI).
URL A URI that represents a Uniform Resource Locator (URL).
UUID An Identifier with the lexical restrictions of a UUID [RFC4122]
B.8 Primitive Types

The primitive types in this section are shared by all 1EdTech specifications.
Type Description
Boolean A boolean, expressed as true or false
Date An [ISO8601] calendar date using the syntax YYYY-MM-DD.
DateTime An [ISO8601] time using the syntax YYYY-MM-DDThh:mm:ss.
Float
Integer
Language A language code [BCP47].
Map A map representing an object with unknown, arbitrary properties
Namespace A namespace data type for defining data from a context other than that as the default for the data model. This is used for importing other data models.
NonNegativeInteger
NormalizedString A String conforming to the normalizedString definition in [XMLSCHEMA-2].
PositiveInteger
String Character strings.
B.9 Verification Support Data Models

The data models in this section are used by the § 9. Verification and Validation process for supporting older credentials created with [VC-DATA-MODEL].
B.9.1 AnyAchievementCredential

AnyAchievementCredential represents an AchievementCredential that might be built using [VC-DATA-MODEL] or [VC-DATA-MODEL-2.0]. The scope of this class is only for verification purposes. It is not intended to be used in the creation of new credentials, where the § B.1.2 AchievementCredential class MUST be used.

The ultimate representation of this class is a choice of exactly one of the classes in the following set:
Type Description
AchievementCredentialv1p1 AchievementCredentials are representations of an awarded achievement, used to share information about a achievement belonging to one earner. Maps to a Verifiable Credential as defined in the [VC-DATA-MODEL]. As described in § 8. Proofs (Signatures), at least one proof mechanism, and the details necessary to evaluate that proof, MUST be expressed for a credential to be a verifiable credential. In the case of an embedded proof, the credential MUST append the proof in the proof property.
AchievementCredential AchievementCredentials are representations of an awarded achievement, used to share information about a achievement belonging to one earner. Maps to a Verifiable Credential as defined in the [VC-DATA-MODEL-2.0]. As described in § 8. Proofs (Signatures), at least one proof mechanism, and the details necessary to evaluate that proof, MUST be expressed for a credential to be a verifiable credential. In the case of an embedded proof, the credential MUST append the proof in the proof property.
B.9.2 AchievementCredentialv1p1

AchievementCredentials are representations of an awarded achievement, used to share information about a achievement belonging to one earner. Maps to a Verifiable Credential as defined in the [VC-DATA-MODEL]. As described in § 8. Proofs (Signatures), at least one proof mechanism, and the details necessary to evaluate that proof, MUST be expressed for a credential to be a verifiable credential. In the case of an embedded proof, the credential MUST append the proof in the proof property.
Property Type Description Multiplicity
@context Context The value of the @context property MUST be an ordered set where the first item is a URI with the value 'https://www.w3.org/2018/credentials/v1', and the second item is a URI with the value 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'. [2..*]
id URI Unambiguous reference to the credential. [1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the URI 'VerifiableCredential', and one of the items MUST be the URI 'AchievementCredential' or the URI 'OpenBadgeCredential'. [1..*]
name String The name of the credential for display purposes in wallets. For example, in a list of credentials and in detail views. [1]
description String The short description of the credential for display purposes in wallets. [0..1]
image Image The image representing the credential for display purposes in wallets. [0..1]
awardedDate DateTimeZ Timestamp of when the credential was awarded. validFrom is used to determine the most recent version of a Credential in conjunction with issuer and id. Consequently, the only way to update a Credental is to update the validFrom, losing the date when the Credential was originally awarded. awardedDate is meant to keep this original date. [0..1]
credentialSubject AchievementSubjectv1p1 The recipient of the achievement. [1]
endorsement EndorsementCredentialv1p1 Allows endorsers to make specific claims about the credential, and the achievement and profiles in the credential. These endorsements are signed with a Data Integrity proof format. [0..*]
endorsementJwt CompactJws Allows endorsers to make specific claims about the credential, and the achievement and profiles in the credential. These endorsements are signed with the VC-JWT proof format. [0..*]
issuer Profilev1p1 A description of the individual, entity, or organization that issued the credential. [1]
issuanceDate DateTimeZ Timestamp of when the credential was issued. [1]
expirationDate DateTimeZ If the credential has some notion of expiry, this indicates a timestamp when a credential should no longer be considered valid. After this time, the credential should be considered expired. [0..1]
proof Proof If present, one or more embedded cryptographic proofs that can be used to detect tampering and verify the authorship of the credential. [0..*]
credentialSchema CredentialSchema The value of the credentialSchema property MUST be one or more data schemas that provide verifiers with enough information to determine if the provided data conforms to the provided schema. [0..*]
credentialStatus CredentialStatus The information in CredentialStatus is used to discover information about the current status of a verifiable credential, such as whether it is suspended or revoked. [0..1]
refreshService RefreshService The information in RefreshService is used to refresh the verifiable credential. [0..1]
termsOfUse TermsOfUse The value of the termsOfUse property tells the verifier what actions it is required to perform (an obligation), not allowed to perform (a prohibition), or allowed to perform (a permission) if it is to accept the verifiable credential. [0..*]
evidence Evidence A description of the work that the recipient did to earn the credential. This can be a page that links out to other pages if linking directly to the work is infeasible. [0..*]
This class can be extended with additional properties.
B.9.3 AnyEndorsementCredential

AnyEndorsementCredential represents an EndorsementCredential that might be built using [VC-DATA-MODEL] or [VC-DATA-MODEL-2.0]. The scope of this class is only for verification purposes. It is not intended to be used in the creation of new credentials, where the [[[#endorsementcredential]] class MUST be used.

The ultimate representation of this class is a choice of exactly one of the classes in the following set:
Type Description
EndorsementCredentialv1p1 A verifiable credential that asserts a claim about an entity. As described in § 8. Proofs (Signatures), at least one proof mechanism, and the details necessary to evaluate that proof, MUST be expressed for a credential to be a verifiable credential. In the case of an embedded proof, the credential MUST append the proof in the proof property.
EndorsementCredential A verifiable credential that asserts a claim about an entity. As described in § 8. Proofs (Signatures), at least one proof mechanism, and the details necessary to evaluate that proof, MUST be expressed for a credential to be a verifiable credential. In the case of an embedded proof, the credential MUST append the proof in the proof property.
B.9.4 EndorsementCredentialv1p1

A verifiable credential that asserts a claim about an entity. As described in § 8. Proofs (Signatures), at least one proof mechanism, and the details necessary to evaluate that proof, MUST be expressed for a credential to be a verifiable credential. In the case of an embedded proof, the credential MUST append the proof in the proof property.
Property Type Description Multiplicity
@context Context The value of the @context property MUST be an ordered set where the first item is a URI with the value 'https://www.w3.org/2018/credentials/v1', and the second item is a URI with the value 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'. [2..*]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the URI 'VerifiableCredential', and one of the items MUST be the URI 'EndorsementCredential'. [1..*]
id URI Unambiguous reference to the credential. [1]
name String The name of the credential for display purposes in wallets. For example, in a list of credentials and in detail views. [1]
description String The short description of the credential for display purposes in wallets. [0..1]
credentialSubject EndorsementSubject The individual, entity, organization, assertion, or achievement that is endorsed and the endorsement comment. [1]
awardedDate DateTimeZ Timestamp of when the credential was awarded. validFrom is used to determine the most recent version of a Credential in conjunction with issuer and id. Consequently, the only way to update a Credental is to update the validFrom, losing the date when the Credential was originally awarded. awardedDate is meant to keep this original date. [0..1]
issuer Profilev1p1 A description of the individual, entity, or organization that issued the credential. [1]
issuanceDate DateTimeZ Timestamp of when the credential was issued. [1]
expirationDate DateTimeZ If the credential has some notion of expiry, this indicates a timestamp when a credential should no longer be considered valid. After this time, the credential should be considered expired. [0..1]
proof Proof If present, one or more embedded cryptographic proofs that can be used to detect tampering and verify the authorship of the credential. [0..*]
credentialSchema CredentialSchema The value of the credentialSchema property MUST be one or more data schemas that provide verifiers with enough information to determine if the provided data conforms to the provided schema. [0..*]
credentialStatus CredentialStatus The information in CredentialStatus is used to discover information about the current status of a verifiable credential, such as whether it is suspended or revoked. [0..1]
refreshService RefreshService The information in RefreshService is used to refresh the verifiable credential. [0..1]
termsOfUse TermsOfUse The value of the termsOfUse property tells the verifier what actions it is required to perform (an obligation), not allowed to perform (a prohibition), or allowed to perform (a permission) if it is to accept the verifiable credential. [0..*]
evidence Evidence A description of the work that the recipient did to earn the credential. This can be a page that links out to other pages if linking directly to the work is infeasible. [0..*]
This class can be extended with additional properties.
B.9.5 VerifiableCredentialv1p1

A Verifiable Credential as defined in the [VC-DATA-MODEL]. As described in § 8. Proofs (Signatures), at least one proof mechanism, and the details necessary to evaluate that proof, MUST be expressed for a credential to be a verifiable credential. In the case of an embedded proof, the credential MUST append the proof in the proof property.
Property Type Description Multiplicity
@context Context The value of the @context property MUST be an ordered set where the first item is a URI with the value 'https://www.w3.org/2018/credentials/v1'. [1..*]
id URI Unambiguous reference to the credential. [0..1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the URI 'VerifiableCredential'. [1..*]
issuer Profilev1p1 A description of the individual, entity, or organization that issued the credential. [1]
issuanceDate DateTimeZ Timestamp of when the credential was issued. [1]
expirationDate DateTimeZ If the credential has some notion of expiry, this indicates a timestamp when a credential should no longer be considered valid. After this time, the credential should be considered expired. [0..1]
credentialSubject CredentialSubject The subject of the credential. [1]
proof Proof If present, one or more embedded cryptographic proofs that can be used to detect tampering and verify the authorship of the credential. [0..*]
credentialSchema CredentialSchema The value of the credentialSchema property MUST be one or more data schemas that provide verifiers with enough information to determine if the provided data conforms to the provided schema. [0..*]
credentialStatus CredentialStatus The information in CredentialStatus is used to discover information about the current status of a verifiable credential, such as whether it is suspended or revoked. [0..1]
refreshService RefreshService The information in RefreshService is used to refresh the verifiable credential. [0..1]
termsOfUse TermsOfUse The value of the termsOfUse property tells the verifier what actions it is required to perform (an obligation), not allowed to perform (a prohibition), or allowed to perform (a permission) if it is to accept the verifiable credential. [0..*]
evidence Evidence A description of the work that the recipient did to earn the credential. This can be a page that links out to other pages if linking directly to the work is infeasible. [0..*]
This class can be extended with additional properties.
B.9.6 AchievementSubjectv1p1

A collection of information about the recipient of an achievement. Maps to Credential Subject in [VC-DATA-MODEL-2.0].
Property Type Description Multiplicity
id URI An identifier for the Credential Subject. Either id or at least one identifier MUST be supplied. [0..1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the IRI 'AchievementSubject'. [1..*]
activityEndDate DateTime The datetime the activity ended. [0..1]
activityStartDate DateTime The datetime the activity started. [0..1]
creditsEarned Float The number of credits earned, generally in semester or quarter credit hours. This field correlates with the Achievement creditsAvailable field. [0..1]
achievement Achievementv1p1 The achievement being awarded. [1]
identifier IdentityObject Other identifiers for the recipient of the achievement. Either id or at least one identifier MUST be supplied. [0..*]
image Image An image representing this user's achievement. If present, this must be a PNG or SVG image, and should be prepared via the 'baking' instructions. An 'unbaked' image for the achievement is defined in the Achievement class and should not be duplicated here. [0..1]
licenseNumber String The license number that was issued with this credential. [0..1]
narrative Markdown A narrative that connects multiple pieces of evidence. Likely only present at this location if evidence is a multi-value array. [0..1]
result Result The set of results being asserted. [0..*]
role String Role, position, or title of the learner when demonstrating or performing the achievement or evidence of learning being asserted. Examples include 'Student President', 'Intern', 'Captain', etc. [0..1]
source Profilev1p1 The person, organization, or system that assessed the achievement on behalf of the issuer. For example, a school may assess the achievement, while the school district issues the credential. [0..1]
term String The academic term in which this assertion was achieved. [0..1]
B.9.7 Achievementv1p1

A collection of information about the accomplishment recognized by the Assertion. Many assertions may be created corresponding to one Achievement.
Property Type Description Multiplicity
id URI Unique URI for the Achievement. [1]
type IRI [1..*]
alignment Alignment An object describing which objectives or educational standards this achievement aligns to, if any. [0..*]
achievementType AchievementType Enumeration The type of achievement. This is an extensible vocabulary. [0..1]
creator Profilev1p1 The person or organization that created the achievement definition. [0..1]
creditsAvailable Float Credit hours associated with this entity, or credit hours possible. For example 3.0. [0..1]
criteria Criteria Criteria describing how to earn the achievement. [1]
description String A short description of the achievement. [1]
endorsement EndorsementCredentialv1p1 Allows endorsers to make specific claims about the Achievement. These endorsements are signed with a Data Integrity proof format. [0..*]
endorsementJwt CompactJws Allows endorsers to make specific claims about the Achievement. These endorsements are signed with the VC-JWT proof format. [0..*]
fieldOfStudy String Category, subject, area of study, discipline, or general branch of knowledge. Examples include Business, Education, Psychology, and Technology. [0..1]
humanCode String The code, generally human readable, associated with an achievement. [0..1]
image Image An image representing the achievement. [0..1]
inLanguage LanguageCode The language of the achievement. [0..1]
name String The name of the achievement. [1]
otherIdentifier IdentifierEntry A list of identifiers for the described entity. [0..*]
related Related The related property identifies another Achievement that should be considered the same for most purposes. It is primarily intended to identify alternate language editions or previous versions of Achievements. [0..*]
resultDescription ResultDescription The set of result descriptions that may be asserted as results with this achievement. [0..*]
specialization String Name given to the focus, concentration, or specific area of study defined in the achievement. Examples include 'Entrepreneurship', 'Technical Communication', and 'Finance'. [0..1]
tag String One or more short, human-friendly, searchable, keywords that describe the type of achievement. [0..*]
version String The version property allows issuers to set a version string for an Achievement. This is particularly useful when replacing a previous version with an update. [0..1]
This class can be extended with additional properties.
B.9.8 Profilev1p1

A Profile is a collection of information that describes the entity or organization using Open Badges. Issuers must be represented as Profiles, and endorsers, or other entities may also be represented using this vocabulary. Each Profile that represents an Issuer may be referenced in many BadgeClasses that it has defined. Anyone can create and host an Issuer file to start issuing Open Badges. Issuers may also serve as recipients of Open Badges, often identified within an Assertion by specific properties, like their url or contact email address.
Property Type Description Multiplicity
id URI Unique URI for the Issuer/Profile file. [1]
type IRI The value of the type property MUST be an unordered set. One of the items MUST be the IRI 'Profile'. [1..*]
name String The name of the entity or organization. [0..1]
url URI The homepage or social media profile of the entity, whether individual or institutional. Should be a URL/URI Accessible via HTTP. [0..1]
phone PhoneNumber [0..1]
description String A short description of the issuer entity or organization. [0..1]
endorsement EndorsementCredentialv1p1 Allows endorsers to make specific claims about the individual or organization represented by this profile. These endorsements are signed with a Data Integrity proof format. [0..*]
endorsementJwt CompactJws Allows endorsers to make specific claims about the individual or organization represented by this profile. These endorsements are signed with the VC-JWT proof format. [0..*]
image Image An image representing the issuer. This must be a PNG or SVG image. [0..1]
email EmailAddress An email address. [0..1]
address Address An address for the individual or organization. [0..1]
otherIdentifier IdentifierEntry A list of identifiers for the described entity. [0..*]
official String If the entity is an organization, official is the name of an authorized official of the organization. [0..1]
parentOrg Profile The parent organization of the entity. [0..1]
familyName String Family name. In the western world, often referred to as the 'last name' of a person. [0..1]
givenName String Given name. In the western world, often referred to as the 'first name' of a person. [0..1]
additionalName String Additional name. Includes what is often referred to as 'middle name' in the western world. [0..1]
patronymicName String Patronymic name. [0..1]
honorificPrefix String Honorific prefix(es) preceding a person's name (e.g. 'Dr', 'Mrs' or 'Mr'). [0..1]
honorificSuffix String Honorific suffix(es) following a person's name (e.g. 'M.D, PhD'). [0..1]
familyNamePrefix String Family name prefix. As used in some locales, this is the leading part of a family name (e.g. 'de' in the name 'de Boer'). [0..1]
dateOfBirth Date Birthdate of the person. [0..1]
This class can be extended with additional properties.
