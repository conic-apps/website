CREATE TABLE releases
(
    id              serial                  NOT NULL,
    version         character varying(25)   NOT NULL,
    pre_release     boolean                 NOT NULL,
    release_time    time with time zone     NOT NULL,
    description     text                    NOT NULL,
    PRIMARY KEY (id)
);