CREATE TABLE artifacts
(
    id          serial                  NOT NULL,
    version     character varying(25)   NOT NULL,
    downloaded  integer                 NOT NULL,
    hash        character varying(100)  NOT NULL,
    os_type     character varying(10)   NOT NULL,
    arch        character varying(10)   NOT NULL,
    bundle_type character varying(10)   NOT NULL,
    PRIMARY KEY (id)
);