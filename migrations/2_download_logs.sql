CREATE TABLE download_logs
(
    id          serial                  NOT NULL,
    "time"      time with time zone     NOT NULL,
    url         character varying(255)  NOT NULL,
    hash        character varying(100)  NOT NULL,
    user_agent  character varying(100)  NOT NULL,
    ip          character varying(100)  NOT NULL,
    version     character varying(25)   NOT NULL,
    os_type     character varying(10)   NOT NULL,
    arch        character varying(10)   NOT NULL,
    bundle_type character varying(10)   NOT NULL,
    PRIMARY KEY (id)
);