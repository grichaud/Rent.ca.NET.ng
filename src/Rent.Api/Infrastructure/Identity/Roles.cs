namespace Rent.Api.Infrastructure.Identity;

public static class Roles
{
    public const string Renter = "Renter";
    public const string Landlord = "Landlord";
    public const string Admin = "Admin";

    public static readonly string[] All = [Renter, Landlord, Admin];
}
