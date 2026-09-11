/* eslint-disable */
import type { Prisma, User, UserLast, Post, ExtraModal, Comment, Profile, Follow, Unrelated, IdOnly, WithoutID, WithScalars } from "../generated/prisma/index.js";
import type { PothosPrismaDatamodel } from "@pothos/plugin-prisma";
export default interface PrismaTypes {
    User: {
        Name: "User";
        Shape: User;
        Include: Prisma.UserInclude;
        Select: Prisma.UserSelect;
        OrderBy: Prisma.UserOrderByWithRelationInput;
        WhereUnique: Prisma.UserWhereUniqueInput;
        Where: Prisma.UserWhereInput;
        Create: {};
        Update: {};
        RelationName: "Posts" | "Comments" | "Profile" | "Followers" | "Following";
        ListRelations: "Posts" | "Comments" | "Profile" | "Followers" | "Following";
        Relations: {
            Posts: {
                Shape: Post[];
                Name: "Post";
                Nullable: false;
            };
            Comments: {
                Shape: Comment[];
                Name: "Comment";
                Nullable: false;
            };
            Profile: {
                Shape: Profile[];
                Name: "Profile";
                Nullable: false;
            };
            Followers: {
                Shape: Follow[];
                Name: "Follow";
                Nullable: false;
            };
            Following: {
                Shape: Follow[];
                Name: "Follow";
                Nullable: false;
            };
        };
    };
    UserLast: {
        Name: "UserLast";
        Shape: UserLast;
        Include: never;
        Select: Prisma.UserLastSelect;
        OrderBy: Prisma.UserLastOrderByWithRelationInput;
        WhereUnique: Prisma.UserLastWhereUniqueInput;
        Where: Prisma.UserLastWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
    Post: {
        Name: "Post";
        Shape: Post;
        Include: Prisma.PostInclude;
        Select: Prisma.PostSelect;
        OrderBy: Prisma.PostOrderByWithRelationInput;
        WhereUnique: Prisma.PostWhereUniqueInput;
        Where: Prisma.PostWhereInput;
        Create: {};
        Update: {};
        RelationName: "Author" | "Comments";
        ListRelations: "Comments";
        Relations: {
            Author: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
            Comments: {
                Shape: Comment[];
                Name: "Comment";
                Nullable: false;
            };
        };
    };
    ExtraModal: {
        Name: "ExtraModal";
        Shape: ExtraModal;
        Include: never;
        Select: Prisma.ExtraModalSelect;
        OrderBy: Prisma.ExtraModalOrderByWithRelationInput;
        WhereUnique: Prisma.ExtraModalWhereUniqueInput;
        Where: Prisma.ExtraModalWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
    Comment: {
        Name: "Comment";
        Shape: Comment;
        Include: Prisma.CommentInclude;
        Select: Prisma.CommentSelect;
        OrderBy: Prisma.CommentOrderByWithRelationInput;
        WhereUnique: Prisma.CommentWhereUniqueInput;
        Where: Prisma.CommentWhereInput;
        Create: {};
        Update: {};
        RelationName: "Author" | "Post";
        ListRelations: never;
        Relations: {
            Author: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
            Post: {
                Shape: Post;
                Name: "Post";
                Nullable: false;
            };
        };
    };
    Profile: {
        Name: "Profile";
        Shape: Profile;
        Include: Prisma.ProfileInclude;
        Select: Prisma.ProfileSelect;
        OrderBy: Prisma.ProfileOrderByWithRelationInput;
        WhereUnique: Prisma.ProfileWhereUniqueInput;
        Where: Prisma.ProfileWhereInput;
        Create: {};
        Update: {};
        RelationName: "User";
        ListRelations: never;
        Relations: {
            User: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
        };
    };
    Follow: {
        Name: "Follow";
        Shape: Follow;
        Include: Prisma.FollowInclude;
        Select: Prisma.FollowSelect;
        OrderBy: Prisma.FollowOrderByWithRelationInput;
        WhereUnique: Prisma.FollowWhereUniqueInput;
        Where: Prisma.FollowWhereInput;
        Create: {};
        Update: {};
        RelationName: "From" | "To";
        ListRelations: never;
        Relations: {
            From: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
            To: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
        };
    };
    Unrelated: {
        Name: "Unrelated";
        Shape: Unrelated;
        Include: never;
        Select: Prisma.UnrelatedSelect;
        OrderBy: Prisma.UnrelatedOrderByWithRelationInput;
        WhereUnique: Prisma.UnrelatedWhereUniqueInput;
        Where: Prisma.UnrelatedWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
    IdOnly: {
        Name: "IdOnly";
        Shape: IdOnly;
        Include: never;
        Select: Prisma.IdOnlySelect;
        OrderBy: Prisma.IdOnlyOrderByWithRelationInput;
        WhereUnique: Prisma.IdOnlyWhereUniqueInput;
        Where: Prisma.IdOnlyWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
    WithoutID: {
        Name: "WithoutID";
        Shape: WithoutID;
        Include: never;
        Select: Prisma.WithoutIDSelect;
        OrderBy: Prisma.WithoutIDOrderByWithRelationInput;
        WhereUnique: Prisma.WithoutIDWhereUniqueInput;
        Where: Prisma.WithoutIDWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
    WithScalars: {
        Name: "WithScalars";
        Shape: WithScalars;
        Include: never;
        Select: Prisma.WithScalarsSelect;
        OrderBy: Prisma.WithScalarsOrderByWithRelationInput;
        WhereUnique: Prisma.WithScalarsWhereUniqueInput;
        Where: Prisma.WithScalarsWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
}
export function getDatamodel(): PothosPrismaDatamodel { return JSON.parse("{\"datamodel\":{\"models\":{\"User\":{\"fields\":[{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"firstName\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"lastName\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"birthdate\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"login\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"password\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Post\",\"kind\":\"object\",\"name\":\"Posts\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"PostToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Comment\",\"kind\":\"object\",\"name\":\"Comments\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CommentToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"Profile\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProfileToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Follow\",\"kind\":\"object\",\"name\":\"Followers\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"followers\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Follow\",\"kind\":\"object\",\"name\":\"Following\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"following\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"UserLast\":{\"fields\":[{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Post\":{\"fields\":[{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"title\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"content\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"Author\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"PostToUser\",\"relationFromFields\":[\"authorId\"],\"isUpdatedAt\":false},{\"type\":\"Comment\",\"kind\":\"object\",\"name\":\"Comments\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CommentToPost\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"authorId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"ExtraModal\":{\"fields\":[{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"title\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Comment\":{\"fields\":[{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"comment\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"Author\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CommentToUser\",\"relationFromFields\":[\"authorId\"],\"isUpdatedAt\":false},{\"type\":\"Post\",\"kind\":\"object\",\"name\":\"Post\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CommentToPost\",\"relationFromFields\":[\"postId\"],\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"authorId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"postId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Profile\":{\"fields\":[{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"bio\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"User\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProfileToUser\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Follow\":{\"fields\":[{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"fromId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"toId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"From\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"following\",\"relationFromFields\":[\"fromId\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"To\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"followers\",\"relationFromFields\":[\"toId\"],\"isUpdatedAt\":false}],\"primaryKey\":{\"name\":\"compositeID\",\"fields\":[\"fromId\",\"toId\"]},\"uniqueIndexes\":[]},\"Unrelated\":{\"fields\":[{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"IdOnly\":{\"fields\":[{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"WithoutID\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"WithScalars\":{\"fields\":[{\"type\":\"BigInt\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"string\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"boolean\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"int\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Float\",\"kind\":\"scalar\",\"name\":\"float\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Decimal\",\"kind\":\"scalar\",\"name\":\"decimal\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"BigInt\",\"kind\":\"scalar\",\"name\":\"bigint\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"datetime\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Bytes\",\"kind\":\"scalar\",\"name\":\"bytes\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]}}}}"); }