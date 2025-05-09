// Add this interface at the top of your file or in a separate types file
export interface MongoCommandResult {
    cursor?: {
        firstBatch?: Array<any>;
        [key: string]: any;
    };
    [key: string]: any;
}