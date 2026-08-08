namespace Rent.Api.Domain;

public enum PropertyType
{
    Apartment,
    Condo,
    House,
    Townhouse,
    Basement,
    Studio,
    Loft,
    Duplex,
    Other
}

public enum ListingStatus
{
    Draft,
    Active,
    Inactive,
    Archived
}

public enum ListingTier
{
    Limited,
    Promoted,
    Featured
}

public enum LeaseTerm
{
    MonthToMonth,
    SixMonths,
    OneYear,
    TwoYears,
    Flexible
}

public enum AlertFrequency
{
    Instant,
    Daily,
    Weekly
}

public enum AiMessageRole
{
    User,
    Assistant,
    System,
    Tool
}
