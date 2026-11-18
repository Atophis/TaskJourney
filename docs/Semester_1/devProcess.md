Branching modes: GitHub Flow (main + short-lived feature branches + integration and testing branches) 
________________________________________________________________________________________________________________________________________________________
|Branch                  |  Purpose                                                                  |  Who can merge into it                           |
|                        |                                                                           |                                                  |
|main                    |Has final version of code                                                  |Anyone after peer review                          |
|                        |                                                                           |                                                  |
|Feature                 |For individual to develop initial capabilities                             |Only the person who is in charge of that feature  |
|                        |                                                                           |                                                  |
|Integration and testing |For components to be combined and testing before it goes to the main branch|Anyone after peer review                          |
|________________________|___________________________________________________________________________|__________________________________________________|
 

Branch naming convention (example: feature/<issue#>-short-name, fix/<issue#>-short-name): 

 Feature/<issue#>short-name, int&test/<issue# of one module><issue# of other module> 

Pull request and review policy: 

•      Number of approvals needed before merging: 2 

•      Who may NOT approve a PR (e.g. its author): The creator of it  

•      Checks that must pass first (CI build, tests, linter): CI build 

•      How often you expect to open PRs: At least one per person per week. 

•      Does agent-written code follow the same rules? It should follow the same rules as a person would and also any code needs to have clear comments delineating the start and end of it.  

Repository architecture – sketch the top-level tree (you will add descriptions and a reference to a standard layout for your framework after class): 

repo/ 
 ├── doc/ 
 ├── front end/ 
 ├── back end/ 
 └── README.md 